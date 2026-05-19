import { GoogleGenAI } from "@google/genai";
import { extractionSchema, type PrintOrderExtraction } from "../domain";

export type ExtractPrintOrderInput = {
  body: string;
  hasFile: boolean;
};

export interface AIProvider {
  extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction>;
}

export class MockAIProvider implements AIProvider {
  async extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction> {
    return extractWithRules(input.body);
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
              text: `Extract print order details from this WhatsApp message. Return only JSON matching this shape: intent, confidence, copies, colorMode, sideMode, paperSize, bindingType, fulfillmentType, pickupTime, pageCount, specialInstructions, missingFields, shouldEscalate, customerReplyDraft. Never calculate price. Message: ${input.body}`
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text ?? "{}";
    return extractionSchema.parse(JSON.parse(text));
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
}

export function extractWithRules(body: string): PrintOrderExtraction {
  const normalized = body.toLowerCase();
  const copiesMatch = normalized.match(/(\d+)\s*(copy|copies|sets?)/);
  const pageMatch = normalized.match(/(\d+)\s*(page|pages)/);
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

  const pickupTime = timeMatch ? normalizeTime(timeMatch[1], timeMatch[2], timeMatch[3]) : null;
  const pageCount = pageMatch ? Number(pageMatch[1]) : null;
  const missingFields = [
    copiesMatch ? null : "copies",
    colorMode ? null : "colorMode",
    sideMode ? null : "sideMode"
  ].filter((field): field is string => Boolean(field));

  return extractionSchema.parse({
    intent: normalized.includes("cancel") ? "cancel_order" : "new_print_order",
    confidence: 0.82,
    copies: copiesMatch ? Number(copiesMatch[1]) : null,
    colorMode,
    sideMode,
    paperSize: normalized.includes("a3") ? "A3" : normalized.includes("legal") ? "legal" : normalized.includes("letter") ? "letter" : null,
    bindingType,
    fulfillmentType: "pickup",
    pickupTime,
    pageCount,
    specialInstructions: body.trim() || null,
    missingFields,
    shouldEscalate: false,
    customerReplyDraft:
      missingFields.length > 0
        ? "Got it. I need one more detail to prepare the quote."
        : "Got it. I can prepare the quote now."
  });
}

function normalizeTime(hourText: string, minuteText: string | undefined, meridiem: string | undefined): string {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? "0");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
