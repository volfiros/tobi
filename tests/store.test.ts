import type { Order } from "../src/domain";
import { isConversationActiveOrder } from "../src/store";

describe("conversation active-order policy", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");
  const order = {
    status: "QUOTE_READY",
    updatedAt: "2026-07-19T11:00:00.000Z",
  } as Order;

  it("keeps recent pre-payment orders in conversation context", () => {
    expect(isConversationActiveOrder(order, now)).toBe(true);
  });

  it("drops pre-payment orders after seven days", () => {
    expect(
      isConversationActiveOrder(
        { ...order, updatedAt: "2026-07-01T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("keeps paid fulfilment orders regardless of age", () => {
    expect(
      isConversationActiveOrder(
        {
          ...order,
          status: "PRINTING",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
  });

  it("never returns terminal orders", () => {
    expect(
      isConversationActiveOrder({ ...order, status: "CANCELLED" }, now),
    ).toBe(false);
  });
});
