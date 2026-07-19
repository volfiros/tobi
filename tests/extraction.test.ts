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
    expect(extractWithRules("front and back print karna").sideMode).toBe(
      "double_sided",
    );
  });

  it("extracts A4 and copy counts separated by a paper-size phrase", () => {
    expect(extractWithRules("Two copies, A4, black and white").paperSize).toBe(
      "A4",
    );
    const legalCopy = extractWithRules("One legal size copy with hard binding");
    expect(legalCopy.copies).toBe(1);
    expect(legalCopy.paperSize).toBe("legal");
  });

  it("fuzzily matches near-miss print option wording", () => {
    const extraction = extractWithRules(
      "prnt this blak and wite spirl doble sideed",
    );

    expect(extraction.intent).toBe("provide_order_details");
    expect(extraction.colorMode).toBe("black_and_white");
    expect(extraction.bindingType).toBe("spiral");
    expect(extraction.sideMode).toBe("double_sided");
  });

  it("fuzzily matches near-miss single-sided and color wording", () => {
    const extraction = extractWithRules("make it colr and singel sided");

    expect(extraction.intent).toBe("provide_order_details");
    expect(extraction.colorMode).toBe("color");
    expect(extraction.sideMode).toBe("single_sided");
  });

  it("treats color removal as black-and-white", () => {
    expect(extractWithRules("remove the color mode").colorMode).toBe(
      "black_and_white",
    );
    expect(extractWithRules("i do not want color").colorMode).toBe(
      "black_and_white",
    );
  });

  it("treats side-mode removal as the opposite deterministic side mode", () => {
    expect(extractWithRules("remove double sided mode").sideMode).toBe(
      "single_sided",
    );
    expect(extractWithRules("print only on the front of each sheet").sideMode).toBe(
      "single_sided",
    );
    expect(extractWithRules("do not want single sided").sideMode).toBe(
      "double_sided",
    );
  });

  it("treats binding removal as default or no binding", () => {
    expect(extractWithRules("remove spiral binding").bindingType).toBe(
      "staple",
    );
    expect(extractWithRules("remove binding").bindingType).toBe("none");
    expect(extractWithRules("do not want staple").bindingType).toBe("none");
  });

  it("treats layout removal as one-up layout", () => {
    expect(extractWithRules("remove 4-up layout").pagesPerSheet).toBe(1);
    expect(extractWithRules("normal layout please").pagesPerSheet).toBe(1);
    expect(extractWithRules("one page per sheet").pagesPerSheet).toBe(1);
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

  it("answers supported-file questions instead of starting an order", () => {
    const result = extractWithRules("What kind of files do you support?");

    expect(result.intent).toBe("other");
    expect(result.customerReplyDraft).toContain("PDF files");
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
