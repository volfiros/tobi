import { validateUnderstandingSlots } from "../src/services/printSlotValidation";

describe("print slot validation", () => {
  it("accepts safe high-confidence slots", () => {
    expect(
      validateUnderstandingSlots({
        confidence: 0.9,
        slots: { copies: 2, colorMode: "color" },
        authoritativePageCount: 18,
      }),
    ).toEqual({
      accepted: { copies: 2, colorMode: "color" },
      rejectedReason: null,
    });
  });

  it("ignores AI page count when PDF page count is authoritative", () => {
    expect(
      validateUnderstandingSlots({
        confidence: 0.9,
        slots: { pageCount: 4 },
        authoritativePageCount: 18,
      }),
    ).toEqual({
      accepted: {},
      rejectedReason: "ignored_ai_page_count",
    });
  });

  it("rejects low-confidence slots without applying changes", () => {
    expect(
      validateUnderstandingSlots({
        confidence: 0.4,
        slots: { copies: 3 },
        authoritativePageCount: null,
      }),
    ).toEqual({
      accepted: {},
      rejectedReason: "low_confidence",
    });
  });

  it("ignores explicit null slots so AI output cannot clear existing print options", () => {
    expect(
      validateUnderstandingSlots({
        confidence: 0.9,
        slots: {
          copies: null,
          colorMode: null,
          sideMode: null,
          pickupTime: null,
          pageCount: null,
        },
        authoritativePageCount: null,
      }),
    ).toEqual({
      accepted: {},
      rejectedReason: null,
    });
  });
});
