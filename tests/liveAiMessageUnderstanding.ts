import { readFile } from "node:fs/promises";
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  FallbackMessageUnderstandingProvider,
  OpenAIMessageUnderstandingProvider,
  RuleFirstMessageUnderstandingProvider,
  RuleMessageUnderstandingProvider,
  type MessageIntent,
  type MessageUnderstanding,
  type UnderstandMessageInput,
} from "../src/services/messageUnderstanding";

type ExpectedSlots = Partial<MessageUnderstanding["slots"]>;

type LiveCase = {
  name: string;
  input: UnderstandMessageInput;
  intent: MessageIntent;
  slots?: ExpectedSlots;
  ambiguity?: boolean;
  critical?: boolean;
};

const ACTIVE_ORDER =
  "active order with PDF, status AWAITING_DETAILS, one copy, color, single sided";

const LIVE_CASES: LiveCase[] = [
  liveCase("new PDF order", "I need to print a PDF", "start_print_order", {}, true),
  liveCase("new xerox order", "I want to take a xerox", "start_print_order", {}, true),
  liveCase("color copies", "Print 3 copies in colour", "start_print_order", {
    copies: 3,
    colorMode: "color",
  }, true),
  liveCase("complete print order", "Two copies, A4, black and white, both sides, spiral binding", "start_print_order", {
    copies: 2,
    paperSize: "A4",
    colorMode: "black_and_white",
    sideMode: "double_sided",
    bindingType: "spiral",
  }, true),
  liveCase("four up", "Print this four pages per sheet", "start_print_order", {
    pagesPerSheet: 4,
  }, true),
  liveCase("legal hard bind", "One legal size copy with hard binding", "start_print_order", {
    copies: 1,
    paperSize: "legal",
    bindingType: "hard_bind",
  }, true),
  liveCase("pickup", "I will pick it up from the shop", "update_order_details", {
    fulfillmentType: "pickup",
  }, false, ACTIVE_ORDER),
  liveCase("PDF caption details", "5 sets colour duplex staple", "start_print_order", {
    copies: 5,
    colorMode: "color",
    sideMode: "double_sided",
    bindingType: "staple",
  }, true),

  liveCase("Indian both side", "Bhai 2 set both side black and white", "start_print_order", {
    copies: 2,
    sideMode: "double_sided",
    colorMode: "black_and_white",
  }),
  liveCase("colour xerox", "Colour xerox chahiye, three copies", "start_print_order", {
    colorMode: "color",
    copies: 3,
  }),
  liveCase("front back phrasing", "front and back print karna", "start_print_order", {
    sideMode: "double_sided",
  }),
  liveCase("one side typo", "make it singel sidde", "update_order_details", {
    sideMode: "single_sided",
  }, false, ACTIVE_ORDER),
  liveCase("spiral typo", "spirl bind kar do", "update_order_details", {
    bindingType: "spiral",
  }, false, ACTIVE_ORDER),
  liveCase("black white typo", "make it blak and wite", "update_order_details", {
    colorMode: "black_and_white",
  }, false, ACTIVE_ORDER),

  liveCase("change copies", "make it 4 copies instead", "update_order_details", {
    copies: 4,
  }, false, ACTIVE_ORDER),
  liveCase("change color", "no colour, black and white please", "update_order_details", {
    colorMode: "black_and_white",
  }, false, ACTIVE_ORDER),
  liveCase("change sides", "put the writing on front and back", "update_order_details", {
    sideMode: "double_sided",
  }, false, ACTIVE_ORDER),
  liveCase("change binding", "bind it like a notebook", "update_order_details", {
    bindingType: "spiral",
  }, false, ACTIVE_ORDER),
  liveCase("change layout", "same file but two pages on each sheet", "update_order_details", {
    pagesPerSheet: 2,
  }, false, ACTIVE_ORDER),
  liveCase("contextual repeat", "same as before but six copies", "update_order_details", {
    copies: 6,
  }, false, ACTIVE_ORDER, false, ["The previous order used double sided A4"]),

  liveCase("quote", "How much will this cost?", "ask_quote", {}, true, ACTIVE_ORDER),
  liveCase("status", "Where is my print order?", "ask_order_status", {}, false, ACTIVE_ORDER),
  liveCase("payment help", "My payment link is not working", "payment_help", {}, true, ACTIVE_ORDER),
  liveCase("human support", "Let me talk to the shop staff", "human_support", {}, false, ACTIVE_ORDER),

  liveCase("ambiguous quality", "make it look better", "unclear", {}, false, ACTIVE_ORDER, true),
  liveCase("ambiguous reference", "do that one again", "unclear", {}, false, ACTIVE_ORDER, true),
  liveCase("ambiguous binding", "use the proper binding", "unclear", {}, false, ACTIVE_ORDER, true),

  liveCase("weather", "What is the weather today?", "general_chat"),
  liveCase("general greeting", "hello, how are you?", "general_chat"),
  liveCase("unrelated recipe", "Give me a dosa recipe", "general_chat"),
];

if (LIVE_CASES.length !== 30) {
  throw new Error(`Expected 30 live AI cases, found ${LIVE_CASES.length}`);
}

const localEnv = await readLocalEnv();
const apiKey = process.env.OPENAI_API_KEY ?? localEnv.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required in the environment or .dev.vars");
}

const baseUrl =
  process.env.OPENAI_BASE_URL ??
  localEnv.OPENAI_BASE_URL ??
  DEFAULT_OPENAI_BASE_URL;
const model =
  process.env.OPENAI_DEFAULT_MODEL ??
  localEnv.OPENAI_DEFAULT_MODEL ??
  DEFAULT_OPENAI_MODEL;
const openAiProvider = new OpenAIMessageUnderstandingProvider(
  apiKey,
  baseUrl,
  model,
);
const provider = new FallbackMessageUnderstandingProvider(
  openAiProvider,
  new RuleMessageUnderstandingProvider(),
);
const ruleProvider = new RuleMessageUnderstandingProvider();
const repetitions = Number(process.env.LIVE_AI_REPETITIONS ?? "3");
if (!Number.isInteger(repetitions) || repetitions < 1) {
  throw new Error("LIVE_AI_REPETITIONS must be a positive integer");
}
const caseFilter = process.env.LIVE_AI_CASE_FILTER;
const selectedCases = caseFilter
  ? LIVE_CASES.filter((testCase) => testCase.name === caseFilter)
  : LIVE_CASES;
if (selectedCases.length === 0) {
  throw new Error(`No live AI case matched LIVE_AI_CASE_FILTER=${caseFilter}`);
}

const durations: number[] = [];
const failures: string[] = [];
const successfulUsage: Array<{
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
}> = [];
const providerErrorCategories: Record<string, number> = {};
let schemaValid = 0;
let correct = 0;
let criticalTotal = 0;
let criticalCorrect = 0;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args: unknown[]) => {
  if (args[0] !== "message_understanding_ai_success") {
    originalConsoleLog(...args);
    return;
  }
  const metrics = args[1] as Record<string, unknown> | undefined;
  successfulUsage.push({
    inputTokens: numericMetric(metrics?.inputTokens),
    outputTokens: numericMetric(metrics?.outputTokens),
    reasoningTokens: numericMetric(metrics?.reasoningTokens),
    cachedInputTokens: numericMetric(metrics?.cachedInputTokens),
  });
};
console.error = (...args: unknown[]) => {
  if (args[0] !== "message_understanding_ai_fallback") {
    originalConsoleError(...args);
    return;
  }
  const metrics = args[1] as
    | { error?: { category?: unknown } }
    | undefined;
  const category = String(metrics?.error?.category ?? "unknown");
  providerErrorCategories[category] =
    (providerErrorCategories[category] ?? 0) + 1;
};

for (const testCase of selectedCases) {
  for (let run = 1; run <= repetitions; run += 1) {
    const startedAt = performance.now();
    let passed = false;
    try {
      const aiResult = await provider.understandMessage(testCase.input);
      const productionProvider = new RuleFirstMessageUnderstandingProvider(
        ruleProvider,
        { understandMessage: async () => aiResult },
      );
      const result = await productionProvider.understandMessage(testCase.input);
      schemaValid += 1;
      const validation = validateResult(testCase, result);
      passed = validation.length === 0;
      if (!passed) {
        failures.push(`${testCase.name} run ${run}: ${validation.join("; ")}`);
      }
    } catch (error) {
      const category =
        error && typeof error === "object" && "category" in error
          ? String(error.category)
          : "unknown";
      providerErrorCategories[category] =
        (providerErrorCategories[category] ?? 0) + 1;
      failures.push(
        `${testCase.name} run ${run}: provider failure (${error instanceof Error ? error.name : "unknown"})`,
      );
    }
    durations.push(performance.now() - startedAt);
    if (passed) correct += 1;
    if (testCase.critical) {
      criticalTotal += 1;
      if (passed) criticalCorrect += 1;
    }
  }
}
console.log = originalConsoleLog;
console.error = originalConsoleError;

const total = selectedCases.length * repetitions;
const p95Ms = percentile(durations, 0.95);
const overallAccuracy = correct / total;
const schemaAccuracy = schemaValid / total;
const criticalAccuracy = criticalTotal === 0 ? 1 : criticalCorrect / criticalTotal;
const passed =
  schemaAccuracy === 1 &&
  criticalAccuracy === 1 &&
  overallAccuracy >= 0.95 &&
  p95Ms < 5_000;

console.log("live_ai_validation_summary", {
  model,
  total,
  schemaValid,
  correct,
  criticalTotal,
  criticalCorrect,
  schemaAccuracy,
  overallAccuracy,
  criticalAccuracy,
  p50Ms: Math.round(percentile(durations, 0.5)),
  p95Ms: Math.round(p95Ms),
  averageInputTokens: averageMetric(successfulUsage, "inputTokens"),
  averageOutputTokens: averageMetric(successfulUsage, "outputTokens"),
  averageReasoningTokens: averageMetric(successfulUsage, "reasoningTokens"),
  averageCachedInputTokens: averageMetric(successfulUsage, "cachedInputTokens"),
  providerCompletions: successfulUsage.length,
  fallbackCount: Object.values(providerErrorCategories).reduce(
    (sum, count) => sum + count,
    0,
  ),
  providerErrorCategories,
  passed,
});

if (failures.length > 0) {
  console.error("live_ai_validation_failures", failures);
}

if (!passed) process.exitCode = 1;

function liveCase(
  name: string,
  body: string,
  intent: MessageIntent,
  slots: ExpectedSlots = {},
  critical = false,
  activeOrderSummary: string | null = null,
  ambiguity = false,
  recentMessages: string[] = [],
): LiveCase {
  return {
    name,
    intent,
    slots,
    critical,
    ambiguity,
    input: {
      body,
      hasPdf: name === "PDF caption details",
      activeOrderSummary,
      recentMessages,
      media:
        name === "PDF caption details"
          ? [
              {
                filename: "document.pdf",
                contentType: "application/pdf",
                pageCount: 4,
                sizeBytes: 1024,
              },
            ]
          : [],
    },
  };
}

function validateResult(
  testCase: LiveCase,
  result: MessageUnderstanding,
): string[] {
  const failures: string[] = [];
  if (result.intent !== testCase.intent) {
    failures.push(`intent expected ${testCase.intent}, received ${result.intent}`);
  }
  for (const [key, expected] of Object.entries(testCase.slots ?? {})) {
    const actual = result.slots[key as keyof MessageUnderstanding["slots"]];
    if (actual !== expected) {
      failures.push(`slot ${key} expected ${String(expected)}, received ${String(actual)}`);
    }
  }
  if (testCase.ambiguity && !result.ambiguity?.question.trim()) {
    failures.push("expected a targeted ambiguity question");
  }
  if (!testCase.ambiguity && result.ambiguity !== null) {
    failures.push("unexpected ambiguity");
  }
  return failures;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1,
  );
  return sorted[index] ?? Number.POSITIVE_INFINITY;
}

function numericMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function averageMetric(
  usage: typeof successfulUsage,
  key: keyof (typeof successfulUsage)[number],
): number | null {
  const values = usage
    .map((entry) => entry[key])
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function readLocalEnv(): Promise<Record<string, string>> {
  let contents: string;
  try {
    contents = await readFile(".dev.vars", "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator);
    values[key] = trimmed
      .slice(separator + 1)
      .replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}
