import { calculateQuote, formatPaise } from "../src/services/pricing";
import { printOptionsSchema } from "../src/domain";

describe("pricing", () => {
  it("calculates deterministic double-sided B&W spiral quote", () => {
    const quote = calculateQuote({
      options: printOptionsSchema.parse({
        pageCount: 18,
        copies: 2,
        colorMode: "black_and_white",
        sideMode: "double_sided",
        paperSize: "A4",
        bindingType: "spiral",
        fulfillmentType: "pickup"
      })
    });

    expect(quote.billableSheets).toBe(18);
    expect(quote.pagesPerSheet).toBe(1);
    expect(quote.totalPaise).toBe(8900);
    expect(formatPaise(quote.totalPaise)).toBe("₹89");
  });

  it("keeps PDF pages constant while applying four-up layout", () => {
    const quote = calculateQuote({
      options: printOptionsSchema.parse({
        pageCount: 284,
        copies: 3,
        colorMode: "black_and_white",
        sideMode: "single_sided",
        pagesPerSheet: 4,
        paperSize: "A4",
        bindingType: "none",
        fulfillmentType: "pickup"
      })
    });

    expect(quote.pages).toBe(284);
    expect(quote.pagesPerSheet).toBe(4);
    expect(quote.billableSheets).toBe(213);
    expect(formatPaise(quote.totalPaise)).toBe("₹428");
  });

  it("rejects incomplete quote inputs", () => {
    expect(() =>
      calculateQuote({
        options: printOptionsSchema.parse({
          copies: 1,
          colorMode: "black_and_white",
          sideMode: null,
          pageCount: 3
        })
      })
    ).toThrow("Cannot calculate quote");
  });
});
