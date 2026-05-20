import { GoogleGenAI } from "@google/genai";
import { extractionSchema, type PrintOrderExtraction } from "../domain";

export type ExtractPrintOrderInput = {
  body: string;
  hasFile: boolean;
};

export type GenerateChatReplyInput = {
  body: string;
  activeOrderSummary?: string | null;
};

export interface AIProvider {
  extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction>;
  generateChatReply(input: GenerateChatReplyInput): Promise<string>;
}

export class MockAIProvider implements AIProvider {
  async extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction> {
    return extractWithRules(input.body, input.hasFile);
  }

  async generateChatReply(input: GenerateChatReplyInput): Promise<string> {
    return draftGeneralConversationReply(input.body, input.body.toLowerCase());
  }
}

export class GeminiAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-2.5-flash-lite"
  ) {}

  async extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Classify and extract a WhatsApp message for a print-order assistant.
Return only JSON matching this shape: intent, confidence, copies, colorMode, sideMode, paperSize, bindingType, pagesPerSheet, fulfillmentType, pickupTime, pageCount, specialInstructions, missingFields, shouldEscalate, customerReplyDraft.
Use intent "other" for greetings or general conversation, "ask_status" for order tracking, "payment_issue" for payment questions, "human_support" for support requests, "cancel_order" for cancellation, "ask_quote" for price questions, "provide_order_details" for print details without an attached file, and "new_print_order" when a PDF/file is attached or the customer clearly starts a print order.
Never calculate price. If hasFile is true, the PDF page count is authoritative; do not infer pageCount from text like "4 pages on one sheet" or "4 pages printed". Put N-up layout in pagesPerSheet instead. hasFile=${input.hasFile}. Message: ${input.body}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text ?? "{}";
    const extraction = extractionSchema.parse(JSON.parse(text));
    return withExtractionOverrides(input.body, input.hasFile, extraction);
  }

  async generateChatReply(input: GenerateChatReplyInput): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are Tobi, a concise WhatsApp support assistant for a demo print-ordering workflow in India.
Answer the user's message directly in 1-3 short sentences.
You can help with PDF print orders, print options, quotes, Razorpay test payment links, order status, and pickup.
Do not invent personal details about the user. If asked what you know about them, say you only know what they share in chat and any active order details linked to this WhatsApp number.
If the question is outside the demo, answer briefly when safe, then guide back to print-order help.
Active order context: ${input.activeOrderSummary ?? "none"}.
User message: ${input.body}`
            }
          ]
        }
      ]
    });

    return response.text?.trim() || draftGeneralConversationReply(input.body, input.body.toLowerCase());
  }
}

export function createAIProvider(env: Pick<Env, "GEMINI_API_KEY" | "GEMINI_DEFAULT_MODEL">): AIProvider {
  if (env.GEMINI_API_KEY) {
    return new FallbackAIProvider(new GeminiAIProvider(env.GEMINI_API_KEY, env.GEMINI_DEFAULT_MODEL || "gemini-2.5-flash-lite"), new MockAIProvider());
  }
  return new MockAIProvider();
}

export class FallbackAIProvider implements AIProvider {
  constructor(
    private readonly primary: AIProvider,
    private readonly fallback: AIProvider
  ) {}

  async extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction> {
    try {
      return await this.primary.extractPrintOrder(input);
    } catch {
      return this.fallback.extractPrintOrder(input);
    }
  }

  async generateChatReply(input: GenerateChatReplyInput): Promise<string> {
    try {
      return await this.primary.generateChatReply(input);
    } catch {
      return this.fallback.generateChatReply(input);
    }
  }
}

export function extractWithRules(body: string, hasFile = false): PrintOrderExtraction {
  const normalized = body.toLowerCase();
  const copies = extractCopies(normalized);
  const pagesPerSheet = extractPagesPerSheet(normalized, hasFile);
  const pageMatch = pagesPerSheet ? null : normalized.match(/(\d+)\s*(page|pages)/);
  const timeMatch = normalized.match(/\b(?:pickup\s+at|at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  const colorMode = /\b(colou?r|color)\b/.test(normalized)
    ? "color"
    : /\b(bw|b\/w|black|black and white|b&w)\b/.test(normalized)
      ? "black_and_white"
      : null;
  const sideMode = /\b(double|duplex|both sides?|two sided|2 sided)\b/.test(normalized)
    ? "double_sided"
    : /\b(single|one side|1 side)\b/.test(normalized)
      ? "single_sided"
      : null;
  const bindingType = /\bspiral\b/.test(normalized)
    ? "spiral"
    : /\bstaple\b/.test(normalized)
      ? "staple"
      : /\bsoft\b/.test(normalized)
        ? "soft_bind"
        : /\bhard\b/.test(normalized)
          ? "hard_bind"
          : /\bno binding|none\b/.test(normalized)
            ? "none"
            : null;

  const intent = classifyIntent(normalized, hasFile);
  const pickupTime = timeMatch ? normalizeTime(timeMatch[1], timeMatch[2], timeMatch[3]) : null;
  const pageCount = pageMatch ? Number(pageMatch[1]) : null;
  const missingFields = [
    copies ? null : "copies",
    colorMode ? null : "colorMode",
    sideMode ? null : "sideMode"
  ].filter((field): field is string => Boolean(field));

  return extractionSchema.parse({
    intent,
    confidence: intent === "new_print_order" || intent === "provide_order_details" ? 0.82 : 0.74,
    copies,
    colorMode,
    sideMode,
    paperSize: normalized.includes("a3") ? "A3" : normalized.includes("legal") ? "legal" : normalized.includes("letter") ? "letter" : null,
    bindingType,
    pagesPerSheet,
    fulfillmentType: "pickup",
    pickupTime,
    pageCount,
    specialInstructions: body.trim() || null,
    missingFields,
    shouldEscalate: false,
    customerReplyDraft: draftReplyForIntent(intent, missingFields.length, body, normalized)
  });
}

function extractCopies(normalized: string): number | null {
  const digitMatch = normalized.match(/\b(\d+)\s*(copy|copies|sets?)\b/);
  if (digitMatch) return Number(digitMatch[1]);

  const words: Record<string, number> = {
    one: 1,
    single: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const wordMatch = normalized.match(/\b(one|single|two|three|four|five|six|seven|eight|nine|ten)\s*(copy|copies|sets?)\b/);
  return wordMatch ? words[wordMatch[1]] : null;
}

function extractPagesPerSheet(normalized: string, hasFile: boolean): 1 | 2 | 4 | 6 | 8 | null {
  const nUpValue = "(2|4|6|8|two|four|six|eight)";
  const explicitNUp = normalized.match(new RegExp(`\\b${nUpValue}\\s*[- ]?up\\b`));
  const pagesOnSheet = normalized.match(new RegExp(`\\b${nUpValue}\\s*pages?\\s*(?:on|onto|per|in|into|fit|fitted|printed)\\s*(?:one|1|single|a)?\\s*(?:page|sheet|side)?\\b`));
  const ambiguousAfterPdf = hasFile ? normalized.match(new RegExp(`\\b${nUpValue}\\s*pages?\\s*printed\\b`)) : null;
  const value = explicitNUp?.[1] ?? pagesOnSheet?.[1] ?? ambiguousAfterPdf?.[1];
  if (value === "2" || value === "two") return 2;
  if (value === "4" || value === "four") return 4;
  if (value === "6" || value === "six") return 6;
  if (value === "8" || value === "eight") return 8;
  return null;
}

function withExtractionOverrides(
  body: string,
  hasFile: boolean,
  extraction: PrintOrderExtraction,
): PrintOrderExtraction {
  const conversation = withSpecificConversationOverride(body, extraction);
  const pagesPerSheet = extractPagesPerSheet(body.toLowerCase(), hasFile);
  const copies = extractCopies(body.toLowerCase());
  if (!pagesPerSheet && !copies) return conversation;
  return {
    ...conversation,
    copies: copies ?? conversation.copies,
    pagesPerSheet: pagesPerSheet ?? conversation.pagesPerSheet,
    pageCount: hasFile ? null : conversation.pageCount,
  };
}

function withSpecificConversationOverride(
  body: string,
  extraction: PrintOrderExtraction,
): PrintOrderExtraction {
  const reply = specificGeneralConversationReply(body, body.toLowerCase());
  return reply ? { ...extraction, intent: "other", customerReplyDraft: reply } : extraction;
}

function classifyIntent(normalized: string, hasFile: boolean): PrintOrderExtraction["intent"] {
  if (/\b(cancel|stop|never mind|nevermind)\b/.test(normalized)) return "cancel_order";
  if (/\b(status|where is|ready|done|progress|track)\b/.test(normalized)) return "ask_status";
  if (/\b(how|explain|works?|process)\b.*\b(payment|pay|razorpay|upi)\b|\b(payment|pay|razorpay|upi)\b.*\b(how|explain|works?|process)\b/.test(normalized)) return "other";
  if (/\b(payment|paid|pay|upi|razorpay|link not working|failed)\b/.test(normalized)) return "payment_issue";
  if (/\b(human|support|help|agent|call me|contact)\b/.test(normalized)) return "human_support";
  if (hasFile || /\b(print|pdf|document|file|copy|copies|pages?|binding|spiral|staple|duplex|double[- ]sided|single[- ]sided|one[- ]sided|black and white|b&w|bw|color|colour|pickup)\b/.test(normalized)) {
    return hasFile ? "new_print_order" : "provide_order_details";
  }
  if (/\b(quote|price|cost|how much|rate)\b/.test(normalized)) return "ask_quote";
  return "other";
}

function draftReplyForIntent(
  intent: PrintOrderExtraction["intent"],
  missingFieldCount: number,
  body: string,
  normalized: string,
): string {
  if (intent === "other") {
    return draftGeneralConversationReply(body, normalized);
  }
  if (intent === "ask_status") {
    return "I can check that. Please share your Tobi order ID, or send details from the same WhatsApp number used for the order.";
  }
  if (intent === "payment_issue") {
    return "I can help with payment. If you already have an order, send the order ID or describe what happened with the payment link.";
  }
  if (intent === "human_support") {
    return "I can help here. Tell me what went wrong, or share your order ID if this is about an existing print order.";
  }
  if (intent === "cancel_order") {
    return "I can cancel an active order if it has not already been completed.";
  }
  return missingFieldCount > 0
    ? "Got it. I need one more detail to prepare the quote."
    : "Got it. I can prepare the quote now.";
}

function draftGeneralConversationReply(body: string, normalized: string): string {
  const specificReply = specificGeneralConversationReply(body, normalized);
  if (specificReply) return specificReply;

  if (/^(hi|hello|hey|namaste|yo)\b[!. ]*$/.test(normalized.trim())) {
    return "Hi. I can help with print orders, quotes, payment links, and order status. What would you like to print today?";
  }

  const cleaned = body.trim();
  if (cleaned.endsWith("?")) {
    return "I can answer questions about this print-order workflow, payments, quotes, and order status. I do not have enough context to answer that question directly yet.";
  }

  return "I understand. For this demo I can help with print orders, quotes, payment links, and order status. Send a PDF or tell me what you want printed.";
}

function specificGeneralConversationReply(body: string, normalized: string): string | null {
  if (/\b(what do you do|who are you|what can you do|help me with)\b/.test(normalized)) {
    return "I am Tobi, a print-order assistant. I can collect your PDF and print options, prepare a quote, send a test payment link, and help track the order until pickup.";
  }

  if (/\b(do you know about me|who am i|what do you know about me|know me)\b/.test(normalized)) {
    return "I only know what you share in this chat and any active print-order details linked to this WhatsApp number. I do not know personal details about you unless you tell me.";
  }

  if (/\b(how|explain|works?|process)\b.*\b(payment|pay|razorpay|upi)\b|\b(payment|pay|razorpay|upi)\b.*\b(how|explain|works?|process)\b/.test(normalized)) {
    return "After I have your PDF and print options, I create a quote and send a Razorpay Test Mode payment link. When Razorpay sends the paid webhook, I mark the order paid automatically and the dashboard can move it toward pickup.";
  }

  if (/\b(how are you|how do you do)\b/.test(normalized)) {
    return "I'm running normally and ready to help. Send a PDF or tell me the print details when you want to place an order.";
  }

  if (/\b(thanks|thank you|ok thanks|cool|great)\b/.test(normalized)) {
    return "You're welcome. Send your PDF whenever you are ready, or ask me about an existing order.";
  }

  return null;
}

function normalizeTime(hourText: string, minuteText: string | undefined, meridiem: string | undefined): string {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? "0");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
