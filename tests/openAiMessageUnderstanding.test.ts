import {
  OpenAIMessageUnderstandingProvider,
  RuleFirstMessageUnderstandingProvider,
  RuleMessageUnderstandingProvider,
  type UnderstandMessageInput,
} from "../src/services/messageUnderstanding";

const INPUT: UnderstandMessageInput = {
  body: "make it two copies and both side",
  hasPdf: true,
  activeOrderSummary: "order TOBI-TEST, status AWAITING_DETAILS",
  recentMessages: ["Please send the print details"],
  media: [
    {
      filename: "private-file.pdf",
      contentType: "application/pdf",
      pageCount: 4,
      sizeBytes: 1024,
    },
  ],
};

describe("OpenAI message understanding", () => {
  it("uses the CodeGate Responses API with fast structured-output settings", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const provider = providerWithFetch(async (input, init) => {
      requests.push({ url: String(input), init });
      return structuredResponse({ copies: 2, sideMode: "double_sided" });
    });

    await expect(provider.understandMessage(INPUT)).resolves.toMatchObject({
      intent: "update_order_details",
      confidence: 0.96,
      slots: { copies: 2, sideMode: "double_sided" },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://codegate.dev/v1/responses");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-codegate-key");
    const body = JSON.parse(String(requests[0]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      max_output_tokens: 384,
      reasoning: { effort: "none" },
      text: {
        format: {
          name: "message_understanding",
          strict: true,
          type: "json_schema",
        },
      },
    });
    expect(body.input).toEqual([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ role: "user" }),
    ]);
    expect(JSON.stringify(body.input)).toContain(
      "answer the customer's exact question directly",
    );
    expect(JSON.stringify(body.input)).toContain(
      "Do not merely say what Tobi can help with",
    );
  });

  it("normalizes nullable wire slots into the existing domain contract", async () => {
    const provider = providerWithFetch(async () =>
      structuredResponse({ bindingType: "spiral" }),
    );

    await expect(provider.understandMessage(INPUT)).resolves.toEqual({
      intent: "update_order_details",
      confidence: 0.96,
      slots: { bindingType: "spiral" },
      ambiguity: null,
      customerReplyDraft: null,
    });
  });

  it("retries one transient upstream failure", async () => {
    let calls = 0;
    const provider = providerWithFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json(
          { error: { message: "temporary", type: "server_error" } },
          { status: 500 },
        );
      }
      return structuredResponse({ copies: 2 });
    });

    await expect(provider.understandMessage(INPUT)).resolves.toMatchObject({
      slots: { copies: 2 },
    });
    expect(calls).toBe(2);
  });

  it("announces one AI request even when the provider retries", async () => {
    let calls = 0;
    let starts = 0;
    const provider = providerWithFetch(
      async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json(
            { error: { message: "temporary", type: "server_error" } },
            { status: 500 },
          );
        }
        return structuredResponse({ copies: 2 });
      },
      undefined,
      () => {
        starts += 1;
      },
    );

    await provider.understandMessage(INPUT);

    expect(calls).toBe(2);
    expect(starts).toBe(1);
  });

  it("continues the AI request when the start hook fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = providerWithFetch(
      async () => structuredResponse({ copies: 2 }),
      undefined,
      () => {
        throw new Error("typing unavailable");
      },
    );

    await expect(provider.understandMessage(INPUT)).resolves.toMatchObject({
      slots: { copies: 2 },
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "typing unavailable",
    );
    errorSpy.mockRestore();
  });

  it("does not retry non-retryable request failures", async () => {
    let calls = 0;
    const provider = providerWithFetch(async () => {
      calls += 1;
      return Response.json(
        { error: { message: "bad request", type: "invalid_request_error" } },
        { status: 400 },
      );
    });

    await expect(provider.understandMessage(INPUT)).rejects.toThrow(
      "OpenAI message understanding failed",
    );
    expect(calls).toBe(1);
  });

  it("does not retry when the total deadline has less than 500ms left", async () => {
    let calls = 0;
    const times = [0, 0, 4_600, 4_600];
    const provider = providerWithFetch(
      async () => {
        calls += 1;
        return Response.json(
          { error: { message: "temporary", type: "server_error" } },
          { status: 500 },
        );
      },
      () => times.shift() ?? 4_600,
    );

    await expect(provider.understandMessage(INPUT)).rejects.toThrow(
      "OpenAI message understanding failed",
    );
    expect(calls).toBe(1);
  });

  it("falls back to rules without logging prompts, keys, or raw output", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const aiProvider = providerWithFetch(async () =>
      Response.json(
        {
          error: {
            message: `rejected private input: ${INPUT.body}`,
            type: "invalid_request_error",
          },
        },
        { status: 401 },
      ),
    );
    const provider = new RuleFirstMessageUnderstandingProvider(
      new RuleMessageUnderstandingProvider(),
      aiProvider,
    );

    await expect(
      provider.understandMessage({
        ...INPUT,
        body: "private customer request without known print terms",
        hasPdf: false,
      }),
    ).resolves.toBeDefined();

    const serializedLogs = JSON.stringify(errorSpy.mock.calls);
    expect(serializedLogs).not.toContain("test-codegate-key");
    expect(serializedLogs).not.toContain("private customer request");
    expect(serializedLogs).not.toContain("rejected private input");
    expect(serializedLogs).toContain("authentication");
    errorSpy.mockRestore();
  });
});

function providerWithFetch(
  mockedFetch: typeof fetch,
  now?: () => number,
  onRequestStart?: () => void,
): OpenAIMessageUnderstandingProvider {
  return new OpenAIMessageUnderstandingProvider(
    "test-codegate-key",
    "https://codegate.dev/v1",
    "gpt-5.4-mini",
    { fetch: mockedFetch, now, onRequestStart },
  );
}

function structuredResponse(
  slots: Partial<DomainWireSlots>,
): Response {
  const understanding: WireUnderstanding = {
    i: 1,
    c: 0.96,
    s: {
      n: slots.copies ?? null,
      c:
        slots.colorMode === undefined
          ? null
          : slots.colorMode === "black_and_white"
            ? 0
            : 1,
      d:
        slots.sideMode === undefined
          ? null
          : slots.sideMode === "single_sided"
            ? 0
            : 1,
      p: null,
      b: slots.bindingType === "spiral" ? 2 : null,
      l: null,
      f: null,
      t: null,
      g: null,
      x: null,
    },
    a: null,
    r: null,
  };
  return Response.json({
    id: "resp_test",
    object: "response",
    created_at: 1,
    status: "completed",
    error: null,
    model: "gpt-5.4-mini-2026-03-17",
    output: [
      {
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(understanding),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 200,
      input_tokens_details: { cached_tokens: 120, cache_write_tokens: 0 },
      output_tokens: 60,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 260,
    },
  });
}

type WireUnderstanding = {
  i: number;
  c: number;
  s: {
    n: number | null;
    c: 0 | 1 | null;
    d: 0 | 1 | null;
    p: 0 | 1 | 2 | 3 | null;
    b: 0 | 1 | 2 | 3 | 4 | null;
    l: 1 | 2 | 4 | 6 | 8 | null;
    f: boolean | null;
    t: string | null;
    g: number | null;
    x: string | null;
  };
  a: { f: string | null; q: string } | null;
  r: string | null;
};

type DomainWireSlots = {
  copies: number;
  colorMode: "black_and_white" | "color";
  sideMode: "single_sided" | "double_sided";
  bindingType: "spiral";
};
