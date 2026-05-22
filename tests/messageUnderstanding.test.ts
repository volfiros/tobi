import {
  DEFAULT_GEMINI_MODEL,
  RuleMessageUnderstandingProvider,
  understandWithRules,
} from "../src/services/messageUnderstanding";

describe("message understanding", () => {
  it("uses Gemini 2.5 Flash Lite as the default model", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-2.5-flash-lite");
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
});
