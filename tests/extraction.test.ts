import { extractWithRules } from "../src/services/extraction";

describe("mock extraction", () => {
  it("extracts common print instructions without calculating price", () => {
    const extraction = extractWithRules("Print this 2 copies bw spiral double sided pickup at 5");

    expect(extraction.copies).toBe(2);
    expect(extraction.colorMode).toBe("black_and_white");
    expect(extraction.sideMode).toBe("double_sided");
    expect(extraction.bindingType).toBe("spiral");
    expect(extraction.pickupTime).toBe("05:00");
    expect(extraction.customerReplyDraft).not.toMatch(/₹|rs|rupee|total/i);
  });
});
