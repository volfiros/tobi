import type { OrderStatus } from "../domain";

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["AWAITING_FILE", "AWAITING_DETAILS", "QUOTE_READY", "CANCELLED"],
  AWAITING_FILE: ["AWAITING_DETAILS", "QUOTE_READY", "CANCELLED"],
  AWAITING_DETAILS: ["QUOTE_READY", "AWAITING_FILE", "CANCELLED"],
  QUOTE_READY: ["PAYMENT_LINK_SENT", "CANCELLED"],
  PAYMENT_LINK_SENT: ["PAYMENT_PENDING", "PAID", "CANCELLED", "FAILED"],
  PAYMENT_PENDING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["SHOP_NOTIFIED", "ACCEPTED", "CANCELLED"],
  SHOP_NOTIFIED: ["ACCEPTED", "PRINTING", "CANCELLED"],
  ACCEPTED: ["PRINTING", "READY_FOR_PICKUP", "CANCELLED"],
  PRINTING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: ["PAYMENT_LINK_SENT", "CANCELLED"]
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order status transition from ${from} to ${to}`);
  }
}

export function nextMissingField(options: {
  hasFile: boolean;
  copies: number | null;
  colorMode: string | null;
  sideMode: string | null;
  pageCount: number | null;
}): "file" | "pageCount" | "copies" | "colorMode" | "sideMode" | null {
  if (!options.hasFile) return "file";
  if (!options.pageCount) return "pageCount";
  if (!options.copies) return "copies";
  if (!options.colorMode) return "colorMode";
  if (!options.sideMode) return "sideMode";
  return null;
}

export function questionForMissingField(field: NonNullable<ReturnType<typeof nextMissingField>>): string {
  const prompts = {
    file: "Please send the PDF file you want printed.",
    pageCount: "I received the PDF, but could not detect the page count. How many pages should I print?",
    copies: "How many copies should I print?",
    colorMode: "Should I print this in black and white or color?",
    sideMode: "Should I print this single-sided or double-sided?"
  };
  return prompts[field];
}
