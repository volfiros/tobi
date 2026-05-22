import { handleInboundWorkflow } from "../src/services/messageWorkflow";
import { MemoryTobiStore } from "../src/store";
import type { InboundWhatsAppMessage, Message } from "../src/domain";
import type { MessageUnderstandingProvider } from "../src/services/messageUnderstanding";

const env = {
  APP_ENV: "test",
  DEMO_SHOP_ID: "shop_demo",
  PUBLIC_APP_URL: "http://localhost:8787",
  DEFAULT_CURRENCY: "INR",
  FILES: {
    async put() {
      return null;
    },
  },
} as unknown as Env;

describe("message workflow", () => {
  it("updates active order from indirect detail message", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000001" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/notes.pdf",
      pageCount: 10,
      fileSizeBytes: 1000,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    await store.transitionOrder(order.id, "AWAITING_DETAILS");
    const inboundMessage = await createInboundMessage(store, customer.id, "make it color instead");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: await store.getOrder(order.id),
      inboundMessage,
      inbound: inbound("make it color instead"),
      understandingProvider: provider({
        intent: "update_order_details",
        confidence: 0.91,
        slots: { colorMode: "color" },
        ambiguity: null,
        customerReplyDraft: null,
      }),
    });

    expect(result.reply).toContain("Please confirm your print order");
    expect(result.actions).toEqual([
      { id: "confirm_quote", title: "Confirm" },
      { id: "cancel_order", title: "Cancel" },
    ]);
    expect((await store.getOrder(order.id))?.printOptions.colorMode).toBe("color");
  });

  it("requotes quote-ready order after pre-payment edit", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000002" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/notes.pdf",
      pageCount: 10,
      fileSizeBytes: 1000,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    order = await store.setQuote(order.id, {
      pages: 10,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 10,
      lineItems: [{ label: "Printing", amountPaise: 2000 }],
      totalPaise: 2200,
      currency: "INR",
    });
    const inboundMessage = await createInboundMessage(store, customer.id, "make it color instead");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: order,
      inboundMessage,
      inbound: inbound("make it color instead"),
      understandingProvider: provider({
        intent: "update_order_details",
        confidence: 0.92,
        slots: { colorMode: "color" },
        ambiguity: null,
        customerReplyDraft: null,
      }),
    });

    const updated = await store.getOrder(order.id);
    expect(result.reply).toContain("Please confirm your print order");
    expect(result.actions).toEqual([
      { id: "confirm_quote", title: "Confirm" },
      { id: "cancel_order", title: "Cancel" },
    ]);
    expect(updated?.status).toBe("QUOTE_READY");
    expect(updated?.printOptions.colorMode).toBe("color");
    expect(updated?.totalPaise).toBeGreaterThan(order.totalPaise);
  });

  it("blocks edits after payment link is sent", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000003" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/notes.pdf",
      pageCount: 10,
      fileSizeBytes: 1000,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    order = await store.setQuote(order.id, {
      pages: 10,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 10,
      lineItems: [{ label: "Printing", amountPaise: 2000 }],
      totalPaise: 2200,
      currency: "INR",
    });
    order = await store.setPaymentRequest(order.id, {
      provider: "razorpay_test",
      paymentLinkId: "plink_test",
      paymentLink: "https://rzp.io/i/test",
      amountPaise: 2200,
    });
    const inboundMessage = await createInboundMessage(store, customer.id, "make it double sided");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: order,
      inboundMessage,
      inbound: inbound("make it double sided"),
      understandingProvider: provider({
        intent: "update_order_details",
        confidence: 0.9,
        slots: { sideMode: "double_sided" },
        ambiguity: null,
        customerReplyDraft: null,
      }),
    });

    expect(result.reply).toContain("cannot automatically change");
    expect(result.actions).toEqual([{ id: "cancel_order", title: "Cancel" }]);
    expect((await store.getOrder(order.id))?.printOptions.sideMode).toBe("single_sided");
  });

  it("uses constrained print-domain fallback for unsafe general chat drafts", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000004" });
    const inboundMessage = await createInboundMessage(store, customer.id, "tell me a joke");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: null,
      inboundMessage,
      inbound: inbound("tell me a joke"),
      understandingProvider: provider({
        intent: "general_chat",
        confidence: 0.9,
        slots: {},
        ambiguity: null,
        customerReplyDraft: "Here is a long unrelated joke about cooking.",
      }),
    });

    expect(result.reply).toContain("PDF print orders");
    expect(result.reply).not.toContain("joke");
    expect(await store.listOrders()).toHaveLength(0);
  });

  it("does not create a stray order when confirm is repeated after payment link is sent", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000005" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/notes.pdf",
      pageCount: 10,
      fileSizeBytes: 1000,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    order = await store.setQuote(order.id, {
      pages: 10,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 10,
      lineItems: [{ label: "Printing", amountPaise: 2000 }],
      totalPaise: 2200,
      currency: "INR",
    });
    order = await store.setPaymentRequest(order.id, {
      provider: "razorpay_test",
      paymentLinkId: "plink_test",
      paymentLink: "https://rzp.io/i/test",
      amountPaise: 2200,
    });
    const inboundMessage = await createInboundMessage(store, customer.id, "Confirm");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: order,
      inboundMessage,
      inbound: inbound("Confirm"),
      understandingProvider: provider({
        intent: "confirm_quote",
        confidence: 0.95,
        slots: {},
        ambiguity: null,
        customerReplyDraft: null,
      }),
    });

    expect(result.reply).toContain("Payment link: https://rzp.io/i/test");
    expect(result.reply).toContain("already has payment status link sent");
    expect(await store.listOrders()).toHaveLength(1);
  });

  it("does not create a stray order when a PDF arrives after payment link is sent", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919900000006" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/notes.pdf",
      pageCount: 10,
      fileSizeBytes: 1000,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    order = await store.setQuote(order.id, {
      pages: 10,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 10,
      lineItems: [{ label: "Printing", amountPaise: 2000 }],
      totalPaise: 2200,
      currency: "INR",
    });
    order = await store.setPaymentRequest(order.id, {
      provider: "razorpay_test",
      paymentLinkId: "plink_test",
      paymentLink: "https://rzp.io/i/test",
      amountPaise: 2200,
    });
    const inboundMessage = await createInboundMessage(store, customer.id, "new file");

    const result = await handleInboundWorkflow({
      store,
      env,
      customer,
      activeOrder: order,
      inboundMessage,
      inbound: {
        ...inbound("new file"),
        media: [
          {
            url: "https://example.test/new.pdf",
            contentType: "application/pdf",
            filename: "new.pdf",
            sizeBytes: 1000,
            pageCount: 4,
          },
        ],
      },
      understandingProvider: provider({
        intent: "start_print_order",
        confidence: 0.95,
        slots: { copies: 1, colorMode: "color", sideMode: "single_sided" },
        ambiguity: null,
        customerReplyDraft: null,
      }),
    });

    expect(result.reply).toContain("cannot automatically change");
    expect(await store.listOrders()).toHaveLength(1);
  });
});

function provider(result: Awaited<ReturnType<MessageUnderstandingProvider["understandMessage"]>>): MessageUnderstandingProvider {
  return {
    async understandMessage() {
      return result;
    },
  };
}

function inbound(body: string): InboundWhatsAppMessage {
  return {
    from: "whatsapp:+919900000000",
    body,
    providerMessageId: null,
    media: [],
    raw: {},
  };
}

async function createInboundMessage(
  store: MemoryTobiStore,
  customerId: string,
  body: string,
): Promise<Message> {
  return store.createMessage({
    customerId,
    orderId: null,
    direction: "inbound",
    provider: "twilio_sandbox",
    processingStatus: "processing",
    providerMessageId: null,
    body,
    mediaCount: 0,
    rawPayloadJson: "{}",
  });
}
