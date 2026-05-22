import type { Order } from "../domain";
import { label } from "../utils/labels";
import { formatPaise } from "./pricing";

export function activeOrderSummary(order: Order): string {
  return [
    `order ${order.publicId}`,
    `status ${order.status}`,
    `payment ${order.paymentStatus}`,
    order.paymentLink ? "payment link available" : "no payment link yet",
  ].join(", ");
}

export function confirmationSummary(order: Order): string {
  const quote = order.quoteSnapshot;
  if (!quote) {
    throw new Error(`Order ${order.id} does not have a quote to confirm`);
  }
  return [
    `Please confirm your print order ${order.publicId}`,
    `Pages: ${quote.pages}`,
    `Copies: ${quote.copies}`,
    `Color: ${label(order.printOptions.colorMode)}`,
    `Sides: ${label(order.printOptions.sideMode)}`,
    `Layout: ${quote.pagesPerSheet}-up`,
    `Paper: ${order.printOptions.paperSize}`,
    `Binding: ${label(order.printOptions.bindingType)}`,
    `Pickup: ${order.printOptions.pickupTime ?? "Anytime"}`,
    `Billable sheets: ${quote.billableSheets}`,
    `Total: ${formatPaise(quote.totalPaise)}`,
    "",
    "Confirm to get the payment link.",
    "Cancel to cancel this order.",
  ].join("\n");
}

export function isConfirmReply(body: string): boolean {
  return /^(confirm|confirmed|yes|ok|okay|proceed)$/i.test(body.trim());
}

export function isCancelReply(body: string): boolean {
  return /^(cancel|cancel order|no|stop)$/i.test(body.trim());
}
