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

  it("understands both the sides as double-sided", () => {
    expect(extractWithRules("want it to be on both the sides").sideMode).toBe(
      "double_sided",
    );
  });

  it("classifies greetings as conversational support instead of print orders", () => {
    const extraction = extractWithRules("hello");

    expect(extraction.intent).toBe("other");
    expect(extraction.customerReplyDraft).toContain("What would you like to print today");
  });

  it("answers common general questions contextually in fallback mode", () => {
    expect(extractWithRules("what do you do?").customerReplyDraft).toContain("print-order assistant");
    expect(extractWithRules("do you know about me?").customerReplyDraft).toContain("I only know what you share");
    expect(extractWithRules("Can you explain how payment works here?").customerReplyDraft).toContain("Razorpay Test Mode payment link");
  });

  it("classifies status and payment questions separately", () => {
    expect(extractWithRules("what is my order status?").intent).toBe("ask_status");
    expect(extractWithRules("my payment link failed").intent).toBe("payment_issue");
    expect(extractWithRules("Can you explain how payment works here?").intent).toBe("other");
  });

  it("treats four-up instructions as layout instead of PDF page count", () => {
    const extraction = extractWithRules("I want 4 pages printed single-sided.", true);

    expect(extraction.pageCount).toBeNull();
    expect(extraction.pagesPerSheet).toBe(4);
    expect(extraction.sideMode).toBe("single_sided");
  });

  it("extracts all print specs from a PDF caption", () => {
    const extraction = extractWithRules(
      "Use this one with black and white printing, four pages per sheet. I want two copies. Print single-sided.",
      true
    );

    expect(extraction.copies).toBe(2);
    expect(extraction.colorMode).toBe("black_and_white");
    expect(extraction.sideMode).toBe("single_sided");
    expect(extraction.pagesPerSheet).toBe(4);
    expect(extraction.pageCount).toBeNull();
  });

  it("extracts copy counts written as words", () => {
    expect(extractWithRules("I want two copies.").copies).toBe(2);
    expect(extractWithRules("Use this one with black and white printing, four pages per sheet. I want two copies.", true).copies).toBe(2);
  });

  it("extracts concise copy-count answers", () => {
    expect(extractWithRules("three").copies).toBe(3);
    expect(extractWithRules("2").copies).toBe(2);
  });

  it("treats no spiral binding as the default staple binding", () => {
    expect(extractWithRules("black and white double-sided no spiral binding", true).bindingType).toBe("staple");
  });

  it("treats generic binding requests as spiral binding", () => {
    expect(extractWithRules("I want binding as well", true).bindingType).toBe("spiral");
  });

  it("classifies printing requests as order workflow intents", () => {
    expect(extractWithRules("I need printing").intent).toBe("provide_order_details");
  });
});
