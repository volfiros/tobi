import OpenAI, {
  APIConnectionError,
  APIError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { PrintOptions } from "../domain";
import { extractWithRules } from "./extraction";

const MESSAGE_INTENTS = [
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
] as const;

export const messageIntentSchema = z.enum(MESSAGE_INTENTS);

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

const openAiPrintOptionSlotSchema = z.object({
  n: z.number().int().positive().nullable(),
  c: z.union([z.literal(0), z.literal(1)]).nullable(),
  d: z.union([z.literal(0), z.literal(1)]).nullable(),
  p: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  b: z
    .union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .nullable(),
  l: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(4),
      z.literal(6),
      z.literal(8),
    ])
    .nullable(),
  f: z.boolean().nullable(),
  t: z.string().nullable(),
  g: z.number().int().positive().nullable(),
  x: z.string().nullable(),
});

export const openAiMessageUnderstandingSchema = z.object({
  i: z.number().int().min(0).max(MESSAGE_INTENTS.length - 1),
  c: z.number().min(0).max(1),
  s: openAiPrintOptionSlotSchema,
  a: z
    .object({
      f: z.string().nullable(),
      q: z.string(),
    })
    .nullable(),
  r: z.string().nullable(),
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

type OpenAIProviderOptions = {
  fetch?: typeof fetch;
  now?: () => number;
  deadlineMs?: number;
  minimumRetryWindowMs?: number;
  onRequestStart?: () => void;
};

type AiCacheIdentity = {
  provider: "openai";
  gateway: "codegate";
  baseUrl: string;
  model: string;
  promptVersion: number;
  schemaVersion: number;
};

export class OpenAIMessageUnderstandingProvider implements MessageUnderstandingProvider {
  private readonly client: OpenAI;
  private readonly now: () => number;
  private readonly deadlineMs: number;
  private readonly minimumRetryWindowMs: number;
  private readonly onRequestStart?: () => void;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = DEFAULT_OPENAI_BASE_URL,
    private readonly model = DEFAULT_OPENAI_MODEL,
    options: OpenAIProviderOptions = {},
  ) {
    this.now = options.now ?? (() => performance.now());
    this.deadlineMs = options.deadlineMs ?? AI_PROVIDER_DEADLINE_MS;
    this.minimumRetryWindowMs =
      options.minimumRetryWindowMs ?? AI_PROVIDER_MINIMUM_RETRY_WINDOW_MS;
    this.onRequestStart = options.onRequestStart;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      maxRetries: 0,
      timeout: this.deadlineMs,
      fetch: options.fetch,
    });
  }

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    const startedAt = this.now();
    let attempts = 0;

    try {
      this.onRequestStart?.();
    } catch {
      console.error("message_understanding_ai_start_hook_error", {
        provider: "openai",
        gateway: gatewayName(this.baseUrl),
        model: this.model,
      });
    }

    while (attempts < 2) {
      attempts += 1;
      const elapsedMs = this.now() - startedAt;
      const remainingMs = Math.max(
        1,
        Math.floor(this.deadlineMs - elapsedMs),
      );
      try {
        const response = await this.client.responses.parse(
          {
            model: this.model,
            input: [
              { role: "system", content: UNDERSTANDING_SYSTEM_PROMPT },
              { role: "user", content: understandingInput(input) },
            ],
            reasoning: { effort: "none" },
            max_output_tokens: AI_PROVIDER_MAX_OUTPUT_TOKENS,
            text: {
              format: zodTextFormat(
                openAiMessageUnderstandingSchema,
                "message_understanding",
              ),
            },
          },
          { maxRetries: 0, timeout: remainingMs },
        );
        if (!response.output_parsed) {
          throw new Error("OpenAI response did not contain structured output");
        }
        const understanding = normalizeOpenAiUnderstanding(
          response.output_parsed,
        );
        logMessageUnderstandingSuccess(
          this.baseUrl,
          this.model,
          understanding,
          this.now() - startedAt,
          attempts,
          response.usage,
        );
        return understanding;
      } catch (error) {
        const remainingAfterErrorMs =
          this.deadlineMs - (this.now() - startedAt);
        if (
          attempts < 2 &&
          isRetryableOpenAiError(error) &&
          remainingAfterErrorMs >= this.minimumRetryWindowMs
        ) {
          continue;
        }
        throw new MessageUnderstandingProviderError(
          error,
          this.now() - startedAt,
          attempts,
          this.baseUrl,
          this.model,
        );
      }
    }

    throw new Error("OpenAI message understanding exhausted attempts");
  }
}

export class CachedMessageUnderstandingProvider implements MessageUnderstandingProvider {
  constructor(
    private readonly provider: MessageUnderstandingProvider,
    private readonly cache: KVNamespace,
    private readonly expirationTtl = AI_UNDERSTANDING_CACHE_TTL_SECONDS,
    private readonly identity = defaultAiCacheIdentity(),
  ) {}

  async understandMessage(
    input: UnderstandMessageInput,
  ): Promise<MessageUnderstanding> {
    const key = await aiUnderstandingCacheKey(input, this.identity);
    try {
      const cached = await this.cache.get(key, "json");
      const parsedCached = messageUnderstandingSchema.safeParse(cached);
      if (parsedCached.success) {
        console.log("message_understanding_ai_cache_hit", {
          provider: this.identity.provider,
          gateway: this.identity.gateway,
          model: this.identity.model,
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
    if (!shouldEscalateToAi(fastUnderstanding, input)) {
      return fastUnderstanding;
    }

    try {
      const aiUnderstanding = await this.aiProvider.understandMessage(input);
      return mergeRuleAndAiUnderstanding(fastUnderstanding, aiUnderstanding);
    } catch (error) {
      logMessageUnderstandingError("rules_first", error);
      return fastUnderstanding;
    }
  }
}

export function createMessageUnderstandingProvider(
  env: Pick<
    Env,
    | "OPENAI_API_KEY"
    | "OPENAI_BASE_URL"
    | "OPENAI_DEFAULT_MODEL"
    | "MESSAGE_UNDERSTANDING_MODE"
    | "SESSIONS"
  >,
  options: { onAiRequestStart?: () => void } = {},
): MessageUnderstandingProvider {
  const fallback = new RuleMessageUnderstandingProvider();
  if (!env.OPENAI_API_KEY || env.MESSAGE_UNDERSTANDING_MODE === "rules_only") {
    return fallback;
  }

  const baseUrl = env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL;
  const model = env.OPENAI_DEFAULT_MODEL || DEFAULT_OPENAI_MODEL;
  const openAiProvider = new OpenAIMessageUnderstandingProvider(
    env.OPENAI_API_KEY,
    baseUrl,
    model,
    { onRequestStart: options.onAiRequestStart },
  );
  const openAi = env.SESSIONS
    ? new CachedMessageUnderstandingProvider(
        openAiProvider,
        env.SESSIONS,
        AI_UNDERSTANDING_CACHE_TTL_SECONDS,
        defaultAiCacheIdentity(baseUrl, model),
      )
    : openAiProvider;
  if (env.MESSAGE_UNDERSTANDING_MODE === "ai_first") {
    return new FallbackMessageUnderstandingProvider(openAi, fallback);
  }

  return new RuleFirstMessageUnderstandingProvider(fallback, openAi);
}

export const DEFAULT_OPENAI_BASE_URL = "https://codegate.dev/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const AI_ESCALATION_CONFIDENCE_THRESHOLD = 0.8;
export const AI_UNDERSTANDING_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
export const AI_PROVIDER_DEADLINE_MS = 4_900;
export const AI_PROVIDER_MINIMUM_RETRY_WINDOW_MS = 500;
export const AI_PROVIDER_MAX_OUTPUT_TOKENS = 384;
export const AI_PROMPT_VERSION = 3;
export const AI_SCHEMA_VERSION = 2;

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
  if (/\b(proper|best|good|suitable)\s+binding\b/.test(normalized)) {
    return parsedUnderstanding(
      "unclear",
      0.5,
      {},
      {
        field: "bindingType",
        question:
          "Which binding would you like: staple, spiral, soft bind, or hard bind?",
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
  if (
    /\b(human|support|agent|call me)\b|\bcontact(?: the)? (?:shop|staff|team)\b|\b(?:talk|speak)\b.{0,20}\b(?:person|someone|staff|team)\b/.test(
      normalized,
    )
  ) {
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
    extraction.intent === "new_print_order" ||
    extraction.intent === "provide_order_details" ||
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

const UNDERSTANDING_SYSTEM_PROMPT = `You are the message understanding layer for Tobi, a WhatsApp print-ordering assistant in India.

Business rules:
- Tobi handles PDF print orders, print options, quotes, Razorpay test payment links, order status, and pickup.
- Use start_print_order when the customer wants a new print job and there is no active order.
- Use update_order_details when the customer provides or changes print options for an active order.
- Use ask_quote, ask_order_status, ask_current_file, confirm_quote, cancel_order, payment_help, and human_support only for those explicit requests.
- Understand English and Indian English print-shop phrasing such as colour, B&W, xerox, copies, sets, single side, and both side.
- Do not output database operations, tool calls, or function names.
- Do not calculate prices.
- Use ask_current_file when the customer asks which PDF or file is currently being used (e.g. "which file?", "what document are you printing?").
- If a PDF exists, PDF page count is authoritative; do not infer pageCount from layout phrases like "four pages per sheet".
- For unrelated topics, use general_chat and briefly redirect to print-order help.
- A recognized request may be incomplete. Missing print fields are not ambiguity: keep the recognized intent, leave unspecified slots null, and set a=null.
- Use unclear with a targeted a.q only when the customer's words genuinely have multiple meanings and cannot map safely to an intent or slot. Never attach ambiguity to another intent.
- Never infer defaults. In particular, "xerox" alone does not specify color, sides, paper, binding, or copies.
- "front and back", "both side", and writing on the front and back mean double_sided. "Bind like a notebook" means spiral.
- Use x=specialInstructions only for an explicit instruction that has no dedicated slot. Do not repeat recognized print phrases in x.
- "Proper binding" without a binding type is unclear; ask which binding type they want.
- Keep customerReplyDraft brief and limited to the print-order service.
- Return null for every slot that the customer did not specify or change.
- Classify directly and emit the compact object immediately; do not deliberate or explain.

Compact output codes:
- i intent: 0=start_print_order, 1=update_order_details, 2=ask_quote, 3=ask_order_status, 4=ask_current_file, 5=confirm_quote, 6=cancel_order, 7=payment_help, 8=human_support, 9=general_chat, 10=unclear.
- s slots: n=copies; c color 0=black_and_white 1=color; d sides 0=single_sided 1=double_sided; p paper 0=A4 1=A3 2=letter 3=legal; b binding 0=none 1=staple 2=spiral 3=soft_bind 4=hard_bind; l=pagesPerSheet; f=true for pickup; t=pickupTime; g=pageCount; x=specialInstructions.
- a ambiguity: f=field and q=question. r=customerReplyDraft.`;

function understandingInput(input: UnderstandMessageInput): string {
  return `Active order context: ${cacheSafeActiveOrderSummary(input.activeOrderSummary) ?? "none"}
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

function shouldEscalateToAi(
  understanding: MessageUnderstanding,
  input: UnderstandMessageInput,
): boolean {
  return (
    understanding.intent === "unclear" ||
    understanding.confidence < AI_ESCALATION_CONFIDENCE_THRESHOLD ||
    (understanding.intent === "update_order_details" &&
      (!hasActionablePrintSlots(understanding.slots) ||
        shouldReviewPartialActiveOrderUpdate(understanding, input)))
  );
}

function shouldReviewPartialActiveOrderUpdate(
  understanding: MessageUnderstanding,
  input: UnderstandMessageInput,
): boolean {
  if (!input.activeOrderSummary) return false;
  const actionableSlotCount = Object.entries(understanding.slots).filter(
    ([key, value]) =>
      value !== null &&
      value !== undefined &&
      key !== "fulfillmentType" &&
      key !== "specialInstructions",
  ).length;
  return actionableSlotCount < 2 && hasUnreviewedInstructionLanguage(input.body);
}

function hasUnreviewedInstructionLanguage(body: string): boolean {
  const normalized = body.toLowerCase();
  return /\b(front|back|reverse|backside|both|two\s+side|two\s+face|notebook|booklet|professional|clean|neat|landscape|portrait|fit|shrink|enlarge|bigger|smaller)\b/.test(
    normalized,
  );
}

function mergeRuleAndAiUnderstanding(
  ruleUnderstanding: MessageUnderstanding,
  aiUnderstanding: MessageUnderstanding,
): MessageUnderstanding {
  const ruleSlots = nonNullSlots(ruleUnderstanding.slots);
  const aiSlots = nonNullSlots(aiUnderstanding.slots);
  const mergedSlots = {
    ...ruleSlots,
    ...aiSlots,
  };
  if (
    ruleUnderstanding.intent === "unclear" &&
    ruleUnderstanding.ambiguity &&
    (aiUnderstanding.intent !== "unclear" || !aiUnderstanding.ambiguity) &&
    !hasActionablePrintSlots(aiUnderstanding.slots)
  ) {
    return messageUnderstandingSchema.parse({
      ...ruleUnderstanding,
      confidence: Math.max(
        ruleUnderstanding.confidence,
        aiUnderstanding.confidence,
      ),
    });
  }
  if (
    hasActionablePrintSlots(ruleUnderstanding.slots) &&
    !hasActionablePrintSlots(aiUnderstanding.slots)
  ) {
    return messageUnderstandingSchema.parse({
      ...ruleUnderstanding,
      confidence: Math.max(
        ruleUnderstanding.confidence,
        aiUnderstanding.confidence,
      ),
      slots: mergedSlots,
      ambiguity: aiUnderstanding.ambiguity ?? ruleUnderstanding.ambiguity,
      customerReplyDraft:
        aiUnderstanding.customerReplyDraft ??
        ruleUnderstanding.customerReplyDraft,
    });
  }

  return messageUnderstandingSchema.parse({
    ...aiUnderstanding,
    confidence: Math.max(ruleUnderstanding.confidence, aiUnderstanding.confidence),
    slots: mergedSlots,
    ambiguity: aiUnderstanding.ambiguity ?? ruleUnderstanding.ambiguity,
    customerReplyDraft:
      aiUnderstanding.customerReplyDraft ?? ruleUnderstanding.customerReplyDraft,
  });
}

function nonNullSlots(
  slots: MessageUnderstanding["slots"],
): Partial<PrintOptions> {
  return Object.fromEntries(
    Object.entries(slots).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  ) as Partial<PrintOptions>;
}

async function aiUnderstandingCacheKey(
  input: UnderstandMessageInput,
  identity: AiCacheIdentity,
): Promise<string> {
  const normalizedBody = input.body.trim().toLowerCase().replace(/\s+/g, " ");
  const contextDependent =
    /\b(it|that|this|same|previous|last|earlier|again|before|usual)\b/.test(
      normalizedBody,
    );
  const cacheInput = JSON.stringify({
    provider: identity.provider,
    gateway: identity.gateway,
    baseUrl: identity.baseUrl,
    model: identity.model,
    promptVersion: identity.promptVersion,
    schemaVersion: identity.schemaVersion,
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
  return `message-understanding:v2:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function cacheSafeActiveOrderSummary(summary: string | null | undefined): string | null {
  return summary?.replace(/order TOBI-[A-Z0-9]+/gi, "active order") ?? null;
}

function logMessageUnderstandingError(mode: string, error: unknown): void {
  const summary = providerErrorSummary(error);
  console.error("message_understanding_ai_fallback", {
    mode,
    provider:
      error instanceof MessageUnderstandingProviderError
        ? error.provider
        : "openai",
    gateway:
      error instanceof MessageUnderstandingProviderError
        ? error.gateway
        : "codegate",
    model:
      error instanceof MessageUnderstandingProviderError
        ? error.model
        : DEFAULT_OPENAI_MODEL,
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
  baseUrl: string,
  model: string,
  understanding: MessageUnderstanding,
  durationMs: number,
  attempts: number,
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details: { cached_tokens: number; cache_write_tokens?: number };
    output_tokens_details: { reasoning_tokens: number };
  } | null | undefined,
): void {
  console.log("message_understanding_ai_success", {
    provider: "openai",
    gateway: gatewayName(baseUrl),
    model,
    durationMs: Math.round(durationMs),
    attempts,
    inputTokens: usage?.input_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    reasoningTokens: usage?.output_tokens_details.reasoning_tokens ?? null,
    cachedInputTokens: usage?.input_tokens_details.cached_tokens ?? null,
    cacheWriteTokens:
      usage?.input_tokens_details.cache_write_tokens ?? null,
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

function normalizeOpenAiUnderstanding(
  understanding: z.infer<typeof openAiMessageUnderstandingSchema>,
): MessageUnderstanding {
  const intent = MESSAGE_INTENTS[understanding.i];
  if (!intent) throw new Error("OpenAI response returned an unknown intent code");
  const slots = compactSlots({
    copies: understanding.s.n,
    colorMode:
      understanding.s.c === null
        ? null
        : (["black_and_white", "color"] as const)[understanding.s.c],
    sideMode:
      understanding.s.d === null
        ? null
        : (["single_sided", "double_sided"] as const)[understanding.s.d],
    paperSize:
      understanding.s.p === null
        ? null
        : (["A4", "A3", "letter", "legal"] as const)[understanding.s.p],
    bindingType:
      understanding.s.b === null
        ? null
        : (["none", "staple", "spiral", "soft_bind", "hard_bind"] as const)[
            understanding.s.b
          ],
    pagesPerSheet: understanding.s.l,
    fulfillmentType: understanding.s.f === true ? "pickup" : null,
    pickupTime: understanding.s.t,
    pageCount: understanding.s.g,
    specialInstructions: understanding.s.x,
  });
  return messageUnderstandingSchema.parse({
    intent,
    confidence: understanding.c,
    slots,
    ambiguity: understanding.a
      ? { field: understanding.a.f, question: understanding.a.q }
      : null,
    customerReplyDraft: understanding.r,
  });
}

function defaultAiCacheIdentity(
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  model = DEFAULT_OPENAI_MODEL,
): AiCacheIdentity {
  return {
    provider: "openai",
    gateway: "codegate",
    baseUrl: normalizeBaseUrl(baseUrl),
    model,
    promptVersion: AI_PROMPT_VERSION,
    schemaVersion: AI_SCHEMA_VERSION,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function gatewayName(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname === "codegate.dev"
      ? "codegate"
      : "openai-compatible";
  } catch {
    return "openai-compatible";
  }
}

function isRetryableOpenAiError(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  return (
    error instanceof APIError &&
    (error.status === 429 || (error.status !== undefined && error.status >= 500))
  );
}

function providerErrorSummary(error: unknown): Record<string, unknown> {
  if (error instanceof MessageUnderstandingProviderError) {
    return {
      category: error.category,
      status: error.status,
      code: error.code,
      durationMs: Math.round(error.durationMs),
      attempts: error.attempts,
    };
  }
  return {
    category: "unexpected",
    status: null,
    code: null,
    durationMs: null,
    attempts: null,
  };
}

class MessageUnderstandingProviderError extends Error {
  readonly provider = "openai";
  readonly gateway: string;
  readonly category: string;
  readonly status: number | null;
  readonly code: string | null;

  constructor(
    error: unknown,
    readonly durationMs: number,
    readonly attempts: number,
    baseUrl: string,
    readonly model: string,
  ) {
    super("OpenAI message understanding failed", { cause: error });
    this.name = "MessageUnderstandingProviderError";
    this.gateway = gatewayName(baseUrl);
    this.status = error instanceof APIError ? (error.status ?? null) : null;
    this.code = error instanceof APIError ? (error.code ?? null) : null;
    this.category = providerErrorCategory(error);
  }
}

function providerErrorCategory(error: unknown): string {
  if (error instanceof APIConnectionError) return "network";
  if (error instanceof APIError) {
    if (error.status === 401) return "authentication";
    if (error.status === 403) return "permission";
    if (error.status === 404) return "model_or_endpoint";
    if (error.status === 429) return "rate_limit";
    if (error.status !== undefined && error.status >= 500) return "upstream";
    return "request";
  }
  if (error instanceof z.ZodError) return "schema";
  return "response";
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
  return /\b(same as usual|like usual|usual one|same as last time|previous order|last order|do that one again|make it look better)\b/.test(
    normalized,
  );
}

function isUnrelatedQuestion(normalized: string): boolean {
  return /\b(weather|cricket|movie|recipe|joke|capital of|stock price)\b/.test(
    normalized,
  );
}
