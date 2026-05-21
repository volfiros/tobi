import type { Order } from "../domain";
import type { TobiStore } from "../store";
import { label } from "../utils/labels";
import { formatPaise } from "./pricing";

export async function createShopNotification(
  store: TobiStore,
  order: Order,
): Promise<void> {
  const body = [
    `New paid print order: ${order.publicId}`,
    `Amount paid: ${formatPaise(order.totalPaise)}`,
    `Files: ${order.files.length}`,
    `Print: ${label(order.printOptions.colorMode)}, ${label(order.printOptions.sideMode)}, ${order.printOptions.pagesPerSheet}-up, ${order.printOptions.paperSize}`,
    `Pickup: ${order.printOptions.pickupTime ?? "Anytime"}`,
  ].join("\n");
  await store.createMessage({
    customerId: null,
    orderId: order.id,
    direction: "outbound",
    provider: "demo",
    processingStatus: "completed",
    providerMessageId: null,
    body,
    mediaCount: 0,
    rawPayloadJson: JSON.stringify({ notification: "shop_paid_order" }),
  });
  await store.addOrderEvent(order.id, "shop_notified", {
    channel: "demo",
    body,
  });
}

export async function createCustomerPaymentConfirmation(
  store: TobiStore,
  order: Order,
): Promise<void> {
  const body = `Payment confirmed for ${order.publicId}. The shop has received your order and will update you when it is ready.`;
  await store.createMessage({
    customerId: order.customerId,
    orderId: order.id,
    direction: "outbound",
    provider: "demo",
    processingStatus: "completed",
    providerMessageId: null,
    body,
    mediaCount: 0,
    rawPayloadJson: JSON.stringify({
      notification: "customer_payment_confirmed",
    }),
  });
  await store.addOrderEvent(order.id, "customer_payment_confirmed", {
    channel: "demo",
    body,
  });
}
