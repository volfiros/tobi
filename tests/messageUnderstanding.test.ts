import {
  AI_ESCALATION_CONFIDENCE_THRESHOLD,
  AI_UNDERSTANDING_CACHE_TTL_SECONDS,
  CachedMessageUnderstandingProvider,
  DEFAULT_GEMINI_MODEL,
  RuleMessageUnderstandingProvider,
  RuleFirstMessageUnderstandingProvider,
  messageUnderstandingSchema,
  understandWithRules,
  type MessageUnderstanding,
  type MessageUnderstandingProvider,
} from "../src/services/messageUnderstanding";

describe("message understanding", () => {
  it("uses Gemini 2.5 Flash Lite as the default model", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
    expect(AI_ESCALATION_CONFIDENCE_THRESHOLD).toBe(0.8);
    expect(AI_UNDERSTANDING_CACHE_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("understands copy-count updates against an active order", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "two copies",
        hasPdf: false,
        activeOrderSummary: "Order has PDF, missing copies/color/sides",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { copies: 2 },
    });
  });

  it("keeps greetings as general chat even with an active order", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "hello",
        hasPdf: false,
        activeOrderSummary: "Order TOBI-TEST is awaiting details for old.pdf.",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "general_chat",
      slots: {},
    });
  });

  it("ignores non-actionable default slots when deciding active-order updates", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "thanks",
        hasPdf: false,
        activeOrderSummary: "Order TOBI-TEST is awaiting details for old.pdf.",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "general_chat",
    });
  });

  it("understands concise copy-count answers against an active order", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "three",
        hasPdf: false,
        activeOrderSummary: "Order has PDF, missing copies",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { copies: 3 },
    });
  });

  it("understands indirect color changes against an active order", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "make it color instead",
        hasPdf: false,
        activeOrderSummary: "Order has PDF, black and white, one copy, single sided",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { colorMode: "color" },
    });
  });

  it("understands both the sides as an active-order double-sided edit", async () => {
    const provider = new RuleMessageUnderstandingProvider();

    await expect(
      provider.understandMessage({
        body: "want it to be on both the sides",
        hasPdf: false,
        activeOrderSummary: "Order has PDF, black and white, one copy, single sided",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { sideMode: "double_sided" },
    });
  });

  it("understands Indian English print-shop phrasing", () => {
    const result = understandWithRules({
      body: "xerox this, both side, colour, two sets",
      hasPdf: true,
      activeOrderSummary: null,
      recentMessages: [],
      media: [{ filename: "notes.pdf", contentType: "application/pdf", pageCount: 12, sizeBytes: 1000 }],
    });

    expect(result.intent).toBe("start_print_order");
    expect(result.slots).toMatchObject({
      copies: 2,
      colorMode: "color",
      sideMode: "double_sided",
    });
  });

  it("returns unclear with a targeted question for ambiguous historical references", () => {
    const result = understandWithRules({
      body: "same as last time",
      hasPdf: false,
      activeOrderSummary: "Order has PDF, missing copies/color/sides",
      recentMessages: [],
      media: [],
    });

    expect(result.intent).toBe("unclear");
    expect(result.ambiguity?.question).toContain("Do you mean");
  });

  it("redirects unrelated questions to print help", () => {
    const result = understandWithRules({
      body: "what is the weather today?",
      hasPdf: false,
      activeOrderSummary: null,
      recentMessages: [],
      media: [],
    });

    expect(result.intent).toBe("general_chat");
    expect(result.customerReplyDraft).toContain("print");
  });

  it("accepts null optional slots from AI responses", () => {
    expect(
      messageUnderstandingSchema.parse({
        intent: "update_order_details",
        confidence: 0.82,
        slots: {
          paperSize: null,
          bindingType: null,
          pagesPerSheet: null,
          fulfillmentType: null,
        },
        ambiguity: null,
        customerReplyDraft: null,
      }),
    ).toMatchObject({
      intent: "update_order_details",
      slots: {
        paperSize: null,
        bindingType: null,
        pagesPerSheet: null,
        fulfillmentType: null,
      },
    });
  });

  it("does not call AI for fast-path rule matches", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({ intent: "general_chat", confidence: 0.9 });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "Confirm",
        hasPdf: false,
        activeOrderSummary: "Order is waiting for quote confirmation",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "confirm_quote",
      confidence: 0.95,
    });
    expect(aiCalls).toBe(0);
  });

  it("does not call AI for definite rule-based print instructions", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({ intent: "general_chat", confidence: 0.9 });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "two copies, black and white, double sided",
        hasPdf: false,
        activeOrderSummary: "order TOBI-TEST, status AWAITING_DETAILS",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      confidence: 0.82,
      slots: {
        copies: 2,
        colorMode: "black_and_white",
        sideMode: "double_sided",
      },
    });
    expect(aiCalls).toBe(0);
  });

  it("escalates low-confidence relevant rule matches to AI", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      {
        async understandMessage() {
          return understanding({
            intent: "update_order_details",
            confidence: 0.79,
          });
        },
      },
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "update_order_details",
            confidence: 0.91,
            slots: { bindingType: "spiral" },
          });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "bind it like a notebook",
        hasPdf: false,
        activeOrderSummary: "order TOBI-TEST, status QUOTE_READY",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      confidence: 0.91,
      slots: { bindingType: "spiral" },
    });
    expect(aiCalls).toBe(1);
  });

  it("escalates unclear rule matches to AI", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "update_order_details",
            confidence: 0.84,
            slots: { copies: 2 },
          });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "same as last time",
        hasPdf: false,
        activeOrderSummary: "Order has PDF, missing copies/color/sides",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { copies: 2 },
    });
    expect(aiCalls).toBe(1);
  });

  it("escalates unrecognized general messages to AI", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "update_order_details",
            confidence: 0.91,
            slots: { sideMode: "double_sided" },
          });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "put the writing on the front and back",
        hasPdf: false,
        activeOrderSummary: "order TOBI-TEST, status QUOTE_READY",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { sideMode: "double_sided" },
    });
    expect(aiCalls).toBe(1);
  });

  it("escalates relevant active-order messages without definite rule slots", async () => {
    let aiCalls = 0;
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "unclear",
            confidence: 0.86,
            ambiguity: {
              field: "specialInstructions",
              question: "What should I change about the print?",
            },
          });
        },
      },
    );

    await expect(
      provider.understandMessage({
        body: "make the print look more professional",
        hasPdf: false,
        activeOrderSummary: "order TOBI-TEST, status QUOTE_READY",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "unclear",
      ambiguity: {
        question: "What should I change about the print?",
      },
    });
    expect(aiCalls).toBe(1);
  });

  it("caches AI understanding results for repeated messages", async () => {
    let aiCalls = 0;
    const cache = memoryKv();
    const provider = new CachedMessageUnderstandingProvider(
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "update_order_details",
            confidence: 0.91,
            slots: { sideMode: "double_sided" },
          });
        },
      },
      cache.namespace,
    );
    const input = {
      body: "Put the writing on the front and back",
      hasPdf: false,
      activeOrderSummary: "order TOBI-ABCD, status QUOTE_READY",
      recentMessages: [],
      media: [],
    };

    await provider.understandMessage(input);
    await provider.understandMessage({
      ...input,
      body: "  put the writing on the front and back  ",
      activeOrderSummary: "order TOBI-WXYZ, status QUOTE_READY",
    });

    expect(aiCalls).toBe(1);
    expect(cache.putOptions).toEqual({
      expirationTtl: AI_UNDERSTANDING_CACHE_TTL_SECONDS,
    });
  });

  it("keeps recent context in cache keys for contextual requests", async () => {
    let aiCalls = 0;
    const cache = memoryKv();
    const provider = new CachedMessageUnderstandingProvider(
      {
        async understandMessage() {
          aiCalls += 1;
          return understanding({
            intent: "update_order_details",
            confidence: 0.91,
            slots: { copies: aiCalls },
          });
        },
      },
      cache.namespace,
    );
    const input = {
      body: "same as before",
      hasPdf: false,
      activeOrderSummary: "order TOBI-ABCD, status AWAITING_DETAILS",
      recentMessages: ["one copy"],
      media: [],
    };

    await provider.understandMessage(input);
    await provider.understandMessage({
      ...input,
      recentMessages: ["three copies"],
    });

    expect(aiCalls).toBe(2);
  });

  it("returns AI understanding when cache operations fail", async () => {
    const provider = new CachedMessageUnderstandingProvider(
      {
        async understandMessage() {
          return understanding({
            intent: "update_order_details",
            confidence: 0.91,
            slots: { bindingType: "spiral" },
          });
        },
      },
      {
        async get() {
          throw new Error("KV unavailable");
        },
        async put() {
          throw new Error("KV unavailable");
        },
      } as unknown as KVNamespace,
    );

    await expect(
      provider.understandMessage({
        body: "bind it like a notebook",
        hasPdf: false,
        activeOrderSummary: "order TOBI-TEST, status QUOTE_READY",
        recentMessages: [],
        media: [],
      }),
    ).resolves.toMatchObject({
      intent: "update_order_details",
      slots: { bindingType: "spiral" },
    });
  });
});

function understanding(
  overrides: Partial<MessageUnderstanding>,
): Awaited<ReturnType<MessageUnderstandingProvider["understandMessage"]>> {
  return {
    intent: "general_chat",
    confidence: 0.9,
    slots: {},
    ambiguity: null,
    customerReplyDraft: null,
    ...overrides,
  };
}

function memoryKv(): {
  namespace: KVNamespace;
  putOptions: KVNamespacePutOptions | undefined;
} {
  const values = new Map<string, string>();
  const cache = {
    putOptions: undefined as KVNamespacePutOptions | undefined,
    namespace: {
      async get(key: string) {
        const value = values.get(key);
        return value ? JSON.parse(value) : null;
      },
      async put(
        key: string,
        value: string,
        options?: KVNamespacePutOptions,
      ) {
        values.set(key, value);
        cache.putOptions = options;
      },
    } as unknown as KVNamespace,
  };
  return cache;
}
