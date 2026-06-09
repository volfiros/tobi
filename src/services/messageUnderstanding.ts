import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { PrintOptions } from "../domain";
import { extractWithRules } from "./extraction";

export const messageIntentSchema = z.enum([
  "start_print_order",
  "update_order_details",
  "ask_quote",
  "ask_order_status",
  "ask_current_file",
  "confirm_quote",
  "cancel_order",
  "payment_help",
  "human_support",
  "general_chat",
  "unclear",
]);

const printOptionSlotSchema = z.object({
  copies: z.number().int().positive().nullable().optional(),
  colorMode: z.enum(["black_and_white", "color"]).nullable().optional(),
  sideMode: z.enum(["single_sided", "double_sided"]).nullable().optional(),
  paperSize: z.enum(["A4", "A3", "letter", "legal"]).nullable().optional(),
  bindingType: z
    .enum(["none", "staple", "spiral", "soft_bind", "hard_bind"])
    .nullable()
    .optional(),
  pagesPerSheet: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(6),
      z.literal(8),
    ])
    .nullable()
    .optional(),
  fulfillmentType: z.literal("pickup").nullable().optional(),
  pickupTime: z.string().nullable().optional(),
  pageCount: z.number().int().positive().nullable().optional(),
  specialInstructions: z.string().nullable().optional(),
});

export const messageUnderstandingSchema = z.object({
  intent: messageIntentSchema,
  confidence: z.number().min(0).max(1),
  slots: printOptionSlotSchema.default({}),
  ambiguity: z
    .object({
      field: z.string().nullable(),
      question: z.string(),
    })
    .nullable(),
  customerReplyDraft: z.string().nullable(),
});

export type MessageIntent = z.infer<typeof messageIntentSchema>;
export type MessageUnderstanding = z.infer<typeof messageUnderstandingSchema>;

export type UnderstandMessageInput = {
  body: string;
  hasPdf: boolean;
  activeOrderSummary?: string | null;
  recentMessages: string[];
  media: Array<{
    filename: string | null;
    contentType: string;
    pageCount: number | null;
    sizeBytes: number | null;
  }>;
};

export interface MessageUnderstandingProvider {
  understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding>;
}

export class RuleMessageUnderstandingProvider implements MessageUnderstandingProvider {
  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    return understandWithRules(input);
  }
}

export class GeminiMessageUnderstandingProvider implements MessageUnderstandingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = DEFAULT_GEMINI_MODEL,
  ) {}

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: understandingPrompt(input),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 512,
      },
    });

    const understanding = messageUnderstandingSchema.parse(
      JSON.parse(response.text ?? "{}"),
    );
    logMessageUnderstandingSuccess(this.model, understanding);
    return understanding;
  }
}

export class CachedMessageUnderstandingProvider implements MessageUnderstandingProvider {
  constructor(
    private readonly provider: MessageUnderstandingProvider,
    private readonly cache: KVNamespace,
    private readonly expirationTtl = AI_UNDERSTANDING_CACHE_TTL_SECONDS,
  ) {}

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    const key = await aiUnderstandingCacheKey(input);
    try {
      const cached = await this.cache.get(key, "json");
      const parsedCached = messageUnderstandingSchema.safeParse(cached);
      if (parsedCached.success) {
        console.log("message_understanding_ai_cache_hit", {
          intent: parsedCached.data.intent,
          confidence: parsedCached.data.confidence,
        });
        return parsedCached.data;
      }
    } catch (error) {
      logAiCacheError("read", error);
    }

    const understanding = await this.provider.understandMessage(input);
    try {
      await this.cache.put(key, JSON.stringify(understanding), {
        expirationTtl: this.expirationTtl,
      });
    } catch (error) {
      logAiCacheError("write", error);
    }
    return understanding;
  }
}

export class FallbackMessageUnderstandingProvider implements MessageUnderstandingProvider {
  constructor(
    private readonly primary: MessageUnderstandingProvider,
    private readonly fallback: MessageUnderstandingProvider,
  ) {}

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    try {
      return await this.primary.understandMessage(input);
    } catch (error) {
      logMessageUnderstandingError("ai_first", error);
      return this.fallback.understandMessage(input);
    }
  }
}

export class RuleFirstMessageUnderstandingProvider implements MessageUnderstandingProvider {
  constructor(
    private readonly fastProvider: MessageUnderstandingProvider,
    private readonly aiProvider: MessageUnderstandingProvider,
  ) {}

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    const fastUnderstanding = await this.fastProvider.understandMessage(input);
    if (!shouldEscalateToAi(fastUnderstanding)) {
      return fastUnderstanding;
    }

    try {
      return await this.aiProvider.understandMessage(input);
    } catch (error) {
      logMessageUnderstandingError("rules_first", error);
      return fastUnderstanding;
    }
  }
}

export function createMessageUnderstandingProvider(
  env: Pick<
    Env,
    | "GEMINI_API_KEY"
    | "GEMINI_DEFAULT_MODEL"
    | "MESSAGE_UNDERSTANDING_MODE"
    | "SESSIONS"
  >,
): MessageUnderstandingProvider {
  const fallback = new RuleMessageUnderstandingProvider();
  if (!env.GEMINI_API_KEY || env.MESSAGE_UNDERSTANDING_MODE === "rules_only") {
    return fallback;
  }

  const geminiProvider = new GeminiMessageUnderstandingProvider(
    env.GEMINI_API_KEY,
    env.GEMINI_DEFAULT_MODEL || DEFAULT_GEMINI_MODEL,
  );
  const gemini = env.SESSIONS
    ? new CachedMessageUnderstandingProvider(geminiProvider, env.SESSIONS)
    : geminiProvider;
  if (env.MESSAGE_UNDERSTANDING_MODE === "ai_first") {
    return new FallbackMessageUnderstandingProvider(gemini, fallback);
  }

  return new RuleFirstMessageUnderstandingProvider(fallback, gemini);
}

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
export const AI_ESCALATION_CONFIDENCE_THRESHOLD = 0.8;
export const AI_UNDERSTANDING_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function understandWithRules(
  input: UnderstandMessageInput,
): MessageUnderstanding {
  const body = input.body.trim();
  const normalized = body.toLowerCase();
  const extraction = extractWithRules(body, input.hasPdf);
  const slots = compactSlots({
    copies: extraction.copies,
    colorMode: extraction.colorMode,
    sideMode: extraction.sideMode,
    paperSize: extraction.paperSize,
    bindingType: extraction.bindingType,
    pagesPerSheet: extraction.pagesPerSheet,
    fulfillmentType: extraction.fulfillmentType,
    pickupTime: extraction.pickupTime,
    pageCount: extraction.pageCount,
    specialInstructions: extraction.specialInstructions,
  });

  if (isConfirm(normalized)) {
    return parsedUnderstanding("confirm_quote", 0.95, {}, null, null);
  }
  if (isCancel(normalized)) {
    return parsedUnderstanding("cancel_order", 0.95, {}, null, null);
  }
  if (isWhichFileQuestion(normalized)) {
    return parsedUnderstanding("ask_current_file", 0.88, {}, null, null);
  }
  if (isUnrelatedQuestion(normalized)) {
    return parsedUnderstanding(
      "general_chat",
      0.72,
      {},
      null,
      "I can help with PDF print orders, quotes, payment links, order status, and pickup. Send a PDF or tell me the print details.",
    );
  }
  if (
    /\b(do you know about me|who am i|what do you know about me|know me)\b/.test(
      normalized,
    )
  ) {
    return parsedUnderstanding(
      "general_chat",
      0.9,
      {},
      null,
      "I only know what you share in this chat and any active print-order details linked to this WhatsApp number. I do not know personal details about you unless you tell me.",
    );
  }
  if (isAmbiguousReference(normalized)) {
    return parsedUnderstanding(
      "unclear",
      0.48,
      {},
      {
        field: null,
        question:
          "Do you mean the current PDF order in this chat? Please tell me the print detail you want to change.",
      },
      null,
    );
  }
  if (/^(hi|hello|hey|namaste|yo)\b[!. ]*$/.test(normalized)) {
    return parsedUnderstanding(
      "general_chat",
      0.9,
      {},
      null,
      "Hi. I can help with PDF print orders, quotes, payment links, order status, and pickup. What would you like to print today?",
    );
  }
  if (/\b(status|where is|ready|done|progress|track)\b/.test(normalized)) {
    return parsedUnderstanding("ask_order_status", 0.9, {}, null, null);
  }
  if (
    /\b(payment|paid|pay|upi|razorpay|link not working|failed)\b/.test(
      normalized,
    )
  ) {
    return parsedUnderstanding("payment_help", 0.86, {}, null, null);
  }
  if (/\b(human|support|help|agent|call me|contact)\b/.test(normalized)) {
    return parsedUnderstanding("human_support", 0.82, {}, null, null);
  }
  if (/\b(quote|price|cost|how much|rate)\b/.test(normalized)) {
    return parsedUnderstanding("ask_quote", 0.86, slots, null, null);
  }
  if (/\b(print|printing|upload|send|share)\s+(?:(?:a|one|1)\s+)?(?:another|new)?\s*(pdf|file|document)\b/.test(normalized)) {
    return parsedUnderstanding("start_print_order", extraction.confidence, slots, null, null);
  }
  if (
    input.hasPdf ||
    /\b(print(?:ing)?|pdf|document|file|copy|copies|sets?|xerox|binding|spiral|staple|duplex|double|both (?:the )?sides?|single|single side|one side|black and white|b&w|bw|colou?r|pickup)\b/.test(
      normalized,
    )
  ) {
    const intent =
      input.hasPdf || !input.activeOrderSummary
        ? "start_print_order"
        : "update_order_details";
    return parsedUnderstanding(
      intent,
      extraction.confidence,
      slots,
      null,
      null,
    );
  }
  if (input.activeOrderSummary && hasActionablePrintSlots(slots)) {
    return parsedUnderstanding(
      "update_order_details",
      extraction.confidence,
      slots,
      null,
      null,
    );
  }
  if (normalized.endsWith("?")) {
    return parsedUnderstanding(
      "general_chat",
      0.72,
      {},
      null,
      "I can help with print-order questions, quotes, payment links, order status, and pickup. Send a PDF or tell me what you want printed.",
    );
  }

  return parsedUnderstanding(
    "general_chat",
    0.7,
    {},
    null,
    "I understand. For this print-order service, send a PDF or tell me the print details you need.",
  );
}

function hasActionablePrintSlots(
  slots: MessageUnderstanding["slots"],
): boolean {
  return Object.entries(slots).some(([key, value]) => {
    if (value === null || value === undefined) return false;
    return key !== "fulfillmentType" && key !== "specialInstructions";
  });
}

function understandingPrompt(input: UnderstandMessageInput): string {
  return `You are the message understanding layer for Tobi, a WhatsApp print-ordering assistant in India.
Return only JSON matching this contract:
{
  "intent": "start_print_order" | "update_order_details" | "ask_quote" | "ask_order_status" | "ask_current_file" | "confirm_quote" | "cancel_order" | "payment_help" | "human_support" | "general_chat" | "unclear",
  "confidence": number from 0 to 1,
  "slots": {
    "copies"?: positive integer | null,
    "colorMode"?: "black_and_white" | "color" | null,
    "sideMode"?: "single_sided" | "double_sided" | null,
    "paperSize"?: "A4" | "A3" | "letter" | "legal",
    "bindingType"?: "none" | "staple" | "spiral" | "soft_bind" | "hard_bind",
    "pagesPerSheet"?: 1 | 2 | 4 | 6 | 8,
    "fulfillmentType"?: "pickup",
    "pickupTime"?: string | null,
    "pageCount"?: positive integer | null,
    "specialInstructions"?: string | null
  },
  "ambiguity": null | { "field": string | null, "question": string },
  "customerReplyDraft": string | null
}

Business context:
- Tobi handles PDF print orders, print options, quotes, Razorpay test payment links, order status, and pickup.
- Understand English and Indian English print-shop phrasing such as colour, B&W, xerox, copies, sets, single side, and both side.
- Do not output database operations, tool calls, or function names.
- Do not calculate prices.
- Use ask_current_file when the customer asks which PDF or file is currently being used (e.g. "which file?", "what document are you printing?").
- If a PDF exists, PDF page count is authoritative; do not infer pageCount from layout phrases like "four pages per sheet".
- For unrelated topics, use general_chat and briefly redirect to print-order help.
- If intent/details are ambiguous, use unclear and provide a targeted ambiguity.question.

Active order context: ${cacheSafeActiveOrderSummary(input.activeOrderSummary) ?? "none"}
Recent messages: ${JSON.stringify(input.recentMessages.slice(-8))}
Media metadata: ${JSON.stringify(input.media)}
hasPdf=${input.hasPdf}
Customer message: ${input.body}`;
}

function parsedUnderstanding(
  intent: MessageIntent,
  confidence: number,
  slots: Partial<PrintOptions>,
  ambiguity: MessageUnderstanding["ambiguity"],
  customerReplyDraft: string | null,
): MessageUnderstanding {
  return messageUnderstandingSchema.parse({
    intent,
    confidence,
    slots,
    ambiguity,
    customerReplyDraft,
  });
}

function shouldEscalateToAi(understanding: MessageUnderstanding): boolean {
  return (
    understanding.intent === "unclear" ||
    understanding.confidence < AI_ESCALATION_CONFIDENCE_THRESHOLD ||
    (understanding.intent === "update_order_details" &&
      !hasActionablePrintSlots(understanding.slots))
  );
}

async function aiUnderstandingCacheKey(
  input: UnderstandMessageInput,
): Promise<string> {
  const normalizedBody = input.body.trim().toLowerCase().replace(/\s+/g, " ");
  const contextDependent =
    /\b(it|that|this|same|previous|last|earlier|again|before|usual)\b/.test(
      normalizedBody,
    );
  const cacheInput = JSON.stringify({
    version: 1,
    body: normalizedBody,
    hasPdf: input.hasPdf,
    activeOrderSummary: cacheSafeActiveOrderSummary(input.activeOrderSummary),
    recentMessages: contextDependent
      ? input.recentMessages.slice(-8).map((message) =>
          message.trim().toLowerCase().replace(/\s+/g, " "),
        )
      : [],
    media: input.media.map((media) => ({
      contentType: media.contentType,
      hasPageCount: media.pageCount !== null,
    })),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(cacheInput),
  );
  return `message-understanding:v1:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function cacheSafeActiveOrderSummary(summary: string | null | undefined): string | null {
  return summary?.replace(/order TOBI-[A-Z0-9]+/gi, "active order") ?? null;
}

function logMessageUnderstandingError(mode: string, error: unknown): void {
  const summary =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message.slice(0, 500),
        }
      : {
          name: "UnknownError",
          message: String(error).slice(0, 500),
        };
  console.error("message_understanding_ai_fallback", {
    mode,
    provider: "gemini",
    model: DEFAULT_GEMINI_MODEL,
    error: summary,
  });
}

function logAiCacheError(operation: "read" | "write", error: unknown): void {
  console.error("message_understanding_ai_cache_error", {
    operation,
    message:
      error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500),
  });
}

function logMessageUnderstandingSuccess(
  model: string,
  understanding: MessageUnderstanding,
): void {
  console.log("message_understanding_ai_success", {
    provider: "gemini",
    model,
    intent: understanding.intent,
    confidence: understanding.confidence,
  });
}

function compactSlots(slots: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(slots).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

function isConfirm(normalized: string): boolean {
  return /^(confirm|confirmed|yes|ok|okay|proceed)$/.test(normalized.trim());
}

function isCancel(normalized: string): boolean {
  return /^(cancel|cancel order|no|stop)$/.test(normalized.trim());
}

function isWhichFileQuestion(normalized: string): boolean {
  return (
    /\b(which|what)\s+(pdf|file|document)\b/.test(normalized) ||
    /\b(pdf|file|document)\s+(are|is)\s+you\s+(considering|using|printing)\b/.test(
      normalized,
    )
  );
}

function isAmbiguousReference(normalized: string): boolean {
  return /\b(same as usual|like usual|usual one|same as last time|previous order|last order)\b/.test(
    normalized,
  );
}

function isUnrelatedQuestion(normalized: string): boolean {
  return /\b(weather|cricket|movie|recipe|joke|capital of|stock price)\b/.test(
    normalized,
  );
}
