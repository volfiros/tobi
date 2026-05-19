import { assertTransition, canTransition, nextMissingField, questionForMissingField } from "../src/services/stateMachine";

describe("order state machine", () => {
  it("allows expected fulfillment transitions", () => {
    expect(canTransition("PAID", "SHOP_NOTIFIED")).toBe(true);
    expect(canTransition("SHOP_NOTIFIED", "ACCEPTED")).toBe(true);
    expect(canTransition("PRINTING", "READY_FOR_PICKUP")).toBe(true);
  });

  it("rejects invalid backwards transitions", () => {
    expect(() => assertTransition("COMPLETED", "PRINTING")).toThrow("Invalid order status transition");
  });

  it("asks for one missing field at a time", () => {
    const missing = nextMissingField({
      hasFile: true,
      pageCount: 12,
      copies: 2,
      colorMode: "black_and_white",
      sideMode: null
    });

    expect(missing).toBe("sideMode");
    if (!missing) throw new Error("Expected sideMode to be missing");
    expect(questionForMissingField(missing)).toContain("single-sided");
  });
});
