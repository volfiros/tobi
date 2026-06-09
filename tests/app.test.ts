import { createApp } from "../src/app";
import { MemoryTobiStore } from "../src/store";
import { hmacSha256Hex } from "../src/services/razorpay";
import { verifyTwilioSignature } from "../src/services/twilio";
import { deflateSync } from "node:zlib";

const env = {
  APP_ENV: "test",
  PUBLIC_APP_URL: "http://localhost:8787",
  DEFAULT_CURRENCY: "INR",
  DEMO_SHOP_ID: "shop_demo",
  DEMO_SHOP_NAME: "Tobi Demo Print Shop",
  ADMIN_PIN: "123456",
  ADMIN_SESSION_TOKEN: "test-session",
  RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
  FILES: {
    async put() {
      return null;
    }
  }
} as unknown as Env;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("compressed-pages.pdf")) {
      return new Response(compressedPdfWithPages(7), {
        headers: { "content-type": "application/pdf" }
      });
    }
    if (url.includes("pages-tree-only.pdf")) {
      return new Response(pdfWithPagesTreeCount(9), {
        headers: { "content-type": "application/pdf" }
      });
    }
    if (url.includes("misleading-stream-count.pdf")) {
      return new Response(compressedPdfWithMisleadingPageTreeCount(), {
        headers: { "content-type": "application/pdf" }
      });
    }
    const pages = url.includes("hrd-notes")
      ? url.includes("HRD_notes_4") || url.includes("hrd-notes-71")
        ? 71
        : 284
      : url.includes("second.pdf")
        ? 8
        : url.includes("file.pdf") || url.includes("first.pdf")
          ? 18
          : 1;
    return new Response(pdfWithPages(pages), {
      headers: { "content-type": "application/pdf" }
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function pdfWithPages(pages: number): string {
  return `%PDF-1.7\n${Array.from({ length: pages }, (_, index) => `${index + 1} 0 obj\n<< /Type /Page >>\nendobj`).join("\n")}\n%%EOF`;
}

function compressedPdfWithPages(pages: number): Uint8Array {
  const compressed = deflateSync(
    Array.from(
      { length: pages },
      (_, index) => `${index + 1} 0 obj\n<< /Type /Page >>\nendobj`,
    ).join("\n"),
  );
  const prefix = new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length ${compressed.byteLength} >>\nstream\n`,
  );
  const suffix = new TextEncoder().encode("\nendstream\nendobj\n%%EOF");
  const bytes = new Uint8Array(prefix.byteLength + compressed.byteLength + suffix.byteLength);
  bytes.set(prefix);
  bytes.set(compressed, prefix.byteLength);
  bytes.set(suffix, prefix.byteLength + compressed.byteLength);
  return bytes;
}

function compressedPdfWithMisleadingPageTreeCount(): Uint8Array {
  const compressed = deflateSync(
    [
      "1 0 obj",
      "<< /Type /Page >>",
      "endobj",
      "<< /Count 4 /Type /Pages >>",
    ].join("\n"),
  );
  const prefix = new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /Length ${compressed.byteLength} >>\nstream\n`,
  );
  const suffix = new TextEncoder().encode("\nendstream\nendobj\n%%EOF");
  const bytes = new Uint8Array(prefix.byteLength + compressed.byteLength + suffix.byteLength);
  bytes.set(prefix);
  bytes.set(compressed, prefix.byteLength);
  bytes.set(suffix, prefix.byteLength + compressed.byteLength);
  return bytes;
}

function pdfWithPagesTreeCount(pages: number): string {
  return `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count ${pages} /Kids [] >>
endobj
%%EOF`;
}

describe("Tobi app", () => {
  it("responds to health checks", async () => {
    const app = createApp(new MemoryTobiStore());
    const response = await app.request("/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "tobi" });
  });

  it("answers general chat without creating an order", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999991",
      MessageSid: "SM_GENERAL_CHAT",
      Body: "hello",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("What would you like to print today");
    expect(text).not.toContain("Please send the PDF");
    expect(await store.listOrders()).toHaveLength(0);
  });

  it("answers status questions for an active order", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999992" });
    const order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.transitionOrder(order.id, "AWAITING_FILE");
    const body = new URLSearchParams({
      From: "whatsapp:+919999999992",
      MessageSid: "SM_STATUS_CHAT",
      Body: "what is my order status?",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    const text = await response.text();
    expect(text).toContain(`Your active order is ${order.publicId}`);
    expect(text).toContain("awaiting file");
  });

  it("answers personal-context questions directly without creating an order", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999993",
      MessageSid: "SM_PERSONAL_CHAT",
      Body: "do you know about me?",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    const text = await response.text();
    expect(text).toContain("I only know what you share");
    expect(text).not.toContain("What would you like to print today");
    expect(await store.listOrders()).toHaveLength(0);
  });

  it("starts an active order for bare printing intent and allows cancellation", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const start = new URLSearchParams({
      From: "whatsapp:+919999999988",
      MessageSid: "SM_BARE_PRINTING_START",
      Body: "I need printing",
      NumMedia: "0"
    });
    const startResponse = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: start },
      env
    );

    const startText = await startResponse.text();
    expect(startText).toContain("Please send the PDF file");
    const [startedOrder] = await store.listOrders();
    expect(startedOrder.status).toBe("AWAITING_FILE");

    const cancel = new URLSearchParams({
      From: "whatsapp:+919999999988",
      MessageSid: "SM_BARE_PRINTING_CANCEL",
      Body: "cancel",
      NumMedia: "0"
    });
    const cancelResponse = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: cancel },
      env
    );

    const cancelText = await cancelResponse.text();
    expect(cancelText).toContain(`Cancelled order ${startedOrder.publicId}`);
    expect((await store.getOrder(startedOrder.id))?.status).toBe("CANCELLED");
  });

  it("creates a quoted order from inbound WhatsApp fixture", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999999",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/file.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "18"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Please confirm your print order TOBI-");
    expect(text).toContain("Pages: 18");
    expect(text).toContain("Copies: 2");
    expect(text).toContain("Confirm to get the payment link.");
    expect(text).toContain("Cancel to cancel this order.");
    expect(text).not.toContain("[ Confirm ]");
    expect(text).not.toContain("Pay here:");

    const [order] = await store.listOrders();
    expect(order.status).toBe("QUOTE_READY");
    expect(order.totalPaise).toBe(8900);

    const confirm = new URLSearchParams({
      From: "whatsapp:+919999999999",
      MessageSid: "SM_CONFIRM_QUOTE",
      Body: "Confirm",
      NumMedia: "0"
    });
    const confirmResponse = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: confirm },
      env
    );
    const confirmText = await confirmResponse.text();
    expect(confirmText).toContain(`Confirmed ${order.publicId}`);
    expect(confirmText).toContain("Pay here:");
    expect((await store.getOrder(order.id))?.status).toBe("PAYMENT_LINK_SENT");
    expect((await store.getOrder(order.id))?.paymentLink).toContain("/demo/pay/");
  });

  it("counts PDF pages from stored media when webhook does not provide page count", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999998",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/sample.pdf",
      MediaContentType0: "application/pdf"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(1);
  });

  it("counts PDF pages from compressed PDF streams", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999976",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/compressed-pages.pdf",
      MediaContentType0: "application/pdf"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(7);
  });

  it("counts PDF pages from page tree count entries", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999975",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/pages-tree-only.pdf",
      MediaContentType0: "application/pdf"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(9);
  });

  it("prefers explicit compressed page objects over misleading stream counts", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999974",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/misleading-stream-count.pdf",
      MediaContentType0: "application/pdf"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(1);
  });

  it("prefers fetched PDF page count over inbound media metadata", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999987",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/metadata-mismatch.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "18"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      },
      env
    );

    expect(response.status).toBe(200);
    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(1);
    expect(order.files[0].pageCount).toBe(1);
  });

  it("keeps PDF page count authoritative when customer asks for four-up layout later", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const pdfOnly = new URLSearchParams({
      From: "whatsapp:+919999999997",
      MessageSid: "SM_FOUR_UP_FILE",
      Body: "This is the PDF file.",
      NumMedia: "1",
      MediaUrl0: "https://example.test/hrd-notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "284"
    });
    const details = new URLSearchParams({
      From: "whatsapp:+919999999997",
      MessageSid: "SM_FOUR_UP_DETAILS",
      Body: "I need 3 copies. Black and white is fine. I want 4 pages printed single-sided.",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: pdfOnly }, env);
    const response = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: details }, env);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Pages: 284");
    expect(text).toContain("Copies: 3");
    expect(text).toContain("Layout: 4-up");
    expect(text).toContain("Billable sheets: 213");
    expect(text).toContain("₹428");

    const [order] = await store.listOrders();
    expect(order.printOptions.pageCount).toBe(284);
    expect(order.printOptions.pagesPerSheet).toBe(4);
    expect(order.quoteSnapshot?.pages).toBe(284);
    expect(order.quoteSnapshot?.billableSheets).toBe(213);
  });

  it("quickly creates a default quote after a filename-only PDF upload", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999993",
      MessageSid: "MM_FILENAME_ONLY_PDF",
      Body: "HRD_notes_4.pdf",
      NumMedia: "1",
      MediaUrl0: "https://example.test/hrd-notes-71.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "71"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Please confirm your print order TOBI-");
    expect(text).toContain("Pages: 71");
    expect(text).toContain("Copies: 1");
    expect(text).toContain("Color: black and white");
    expect(text).toContain("Sides: single sided");
    expect(text).toContain("Layout: 1-up");
    expect(text).toContain("Paper: A4");
    expect(text).toContain("Binding: staple");

    const [order] = await store.listOrders();
    expect(order.status).toBe("QUOTE_READY");
    expect(order.printOptions).toMatchObject({
      pageCount: 71,
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
      pagesPerSheet: 1,
      paperSize: "A4",
      bindingType: "staple"
    });

    const messages = await store.listInboundMessagesForOrder(order.id);
    expect(messages).toHaveLength(1);
  });

  it("does not reuse an older uploaded PDF for a fresh text-only PDF request", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999982" });
    const previousOrder = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: previousOrder.id,
      originalFilename: "old-notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/old-notes.pdf",
      pageCount: 71,
      fileSizeBytes: 1000
    });
    await store.transitionOrder(previousOrder.id, "AWAITING_DETAILS");
    const body = new URLSearchParams({
      From: "whatsapp:+919999999982",
      MessageSid: "SM_FRESH_PDF_REQUEST_AFTER_OLD_ORDER",
      Body: "I want to print a new PDF",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain("Please send the PDF file");

    const orders = await store.listOrders();
    const freshOrder = orders.find((candidate) => candidate.files.length === 0);
    const oldOrder = orders.find((candidate) => candidate.id === previousOrder.id);
    expect(orders).toHaveLength(2);
    expect(freshOrder?.status).toBe("AWAITING_FILE");
    expect(oldOrder?.files[0]?.originalFilename).toBe("old-notes.pdf");
  });

  it("answers which PDF is active instead of treating the question as print specs", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999983" });
    const order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "HRD_notes_4.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/hrd-notes.pdf",
      pageCount: 71,
      fileSizeBytes: 1000
    });
    await store.updatePrintOptions(order.id, { copies: 6 });
    await store.transitionOrder(order.id, "AWAITING_DETAILS");
    const body = new URLSearchParams({
      From: "whatsapp:+919999999983",
      MessageSid: "SM_WHICH_PDF_ACTIVE",
      Body: "black and white but which pdf are you considering for printing?",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain(`I am currently using order ${order.publicId}`);
    expect(text).toContain("HRD_notes_4.pdf");
    expect(text).toContain("71 pages");
    expect(text).not.toContain("single-sided or double-sided");
  });

  it("understands word-based copy counts in print details", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999996",
      MessageSid: "SM_WORD_COPIES",
      Body: "Use this one with black and white printing, four pages per sheet. I want two copies.",
      NumMedia: "1",
      MediaUrl0: "https://example.test/hrd-notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "284"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain("Please confirm your print order TOBI-");
    expect(text).not.toContain("How many copies");
    expect(text).not.toContain("single-sided or double-sided");

    const [order] = await store.listOrders();
    expect(order.printOptions.copies).toBe(2);
    expect(order.printOptions.sideMode).toBe("single_sided");
    expect(order.printOptions.pagesPerSheet).toBe(4);
    expect(order.printOptions.pageCount).toBe(284);
  });

  it("uses print specs from the PDF caption without asking duplicate questions", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999994",
      MessageSid: "SM_PDF_CAPTION_SPECS",
      Body: "Use this one with black and white printing, four pages per sheet. I want two copies. Print single-sided.",
      NumMedia: "1",
      MediaUrl0: "https://example.test/hrd-notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "284"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain("Please confirm your print order TOBI-");
    expect(text).toContain("Pages: 284");
    expect(text).toContain("Copies: 2");
    expect(text).toContain("Layout: 4-up");
    expect(text).toContain("Billable sheets: 142");
    expect(text).toContain("₹286");
    expect(text).not.toContain("How many copies");
    expect(text).not.toContain("single-sided or double-sided");

    const [order] = await store.listOrders();
    expect(order.printOptions).toMatchObject({
      pageCount: 284,
      copies: 2,
      colorMode: "black_and_white",
      sideMode: "single_sided",
      pagesPerSheet: 4
    });
  });

  it("updates copies from a short adaptive follow-up after a PDF upload", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const pdfOnly = new URLSearchParams({
      From: "whatsapp:+919999999980",
      MessageSid: "SM_ADAPTIVE_PDF_FIRST",
      Body: "notes.pdf",
      NumMedia: "1",
      MediaUrl0: "https://example.test/notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "12"
    });
    const copies = new URLSearchParams({
      From: "whatsapp:+919999999980",
      MessageSid: "SM_ADAPTIVE_TWO_COPIES",
      Body: "two copies",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: pdfOnly }, env);
    const response = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: copies }, env);

    const text = await response.text();
    const [order] = await store.listOrders();
    expect(order.printOptions.copies).toBe(2);
    expect(text).toContain("Please confirm your print order");
    expect(text).toContain("Copies: 2");
    expect(text).toContain("Color: black and white");
    expect(text).toContain("Sides: single sided");
  });

  it("updates side mode from an indirect same-file follow-up without creating another order", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const pdfOnly = new URLSearchParams({
      From: "whatsapp:+919999999979",
      MessageSid: "SM_ADAPTIVE_SAME_FILE_PDF",
      Body: "notes.pdf",
      NumMedia: "1",
      MediaUrl0: "https://example.test/notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "12"
    });
    const side = new URLSearchParams({
      From: "whatsapp:+919999999979",
      MessageSid: "SM_ADAPTIVE_SAME_FILE_SIDE",
      Body: "same file single side",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: pdfOnly }, env);
    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: side }, env);

    const orders = await store.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].printOptions.sideMode).toBe("single_sided");
  });

  it("recomputes a quote-ready order when the customer edits before payment", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const first = new URLSearchParams({
      From: "whatsapp:+919999999978",
      MessageSid: "SM_ADAPTIVE_REQUOTE_FIRST",
      Body: "1 copy B&W single sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "10"
    });
    const edit = new URLSearchParams({
      From: "whatsapp:+919999999978",
      MessageSid: "SM_ADAPTIVE_REQUOTE_COLOR",
      Body: "make it color instead",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: first }, env);
    const before = (await store.listOrders())[0];
    const response = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: edit }, env);
    const after = (await store.getOrder(before.id))!;

    expect(await response.text()).toContain("Please confirm your print order");
    expect(after.status).toBe("QUOTE_READY");
    expect(after.printOptions.colorMode).toBe("color");
    expect(after.totalPaise).toBeGreaterThan(before.totalPaise);
  });

  it("recomputes a quote-ready order for both the sides phrasing", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const first = new URLSearchParams({
      From: "whatsapp:+919999999975",
      MessageSid: "SM_REQUOTE_BOTH_THE_SIDES_FIRST",
      Body: "1 copy B&W single sided",
      NumMedia: "1",
      MediaUrl0: "https://example.test/notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "3"
    });
    const edit = new URLSearchParams({
      From: "whatsapp:+919999999975",
      MessageSid: "SM_REQUOTE_BOTH_THE_SIDES_EDIT",
      Body: "want it to be on both the sides",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: first }, env);
    const [order] = await store.listOrders();
    const response = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: edit }, env);
    const updated = await store.getOrder(order.id);

    expect(await response.text()).toContain("Sides: double sided");
    expect(updated?.status).toBe("QUOTE_READY");
    expect(updated?.printOptions.sideMode).toBe("double_sided");
  });

  it("does not mutate print options after a payment link is sent", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const first = new URLSearchParams({
      From: "whatsapp:+919999999977",
      MessageSid: "SM_ADAPTIVE_PAYMENT_FIRST",
      Body: "1 copy B&W single sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/notes.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "10"
    });
    const confirm = new URLSearchParams({
      From: "whatsapp:+919999999977",
      MessageSid: "SM_ADAPTIVE_PAYMENT_CONFIRM",
      Body: "Confirm",
      NumMedia: "0"
    });
    const edit = new URLSearchParams({
      From: "whatsapp:+919999999977",
      MessageSid: "SM_ADAPTIVE_PAYMENT_EDIT",
      Body: "make it color instead",
      NumMedia: "0"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: first }, env);
    const [order] = await store.listOrders();
    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: confirm }, env);
    const response = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: edit }, env);

    expect(await response.text()).toContain("cannot automatically change");
    expect((await store.getOrder(order.id))?.printOptions.colorMode).toBe("black_and_white");
  });

  it("answers unexpected print-domain questions without the generic fallback", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999976",
      MessageSid: "SM_ADAPTIVE_PRINT_DOMAIN_QUESTION",
      Body: "can you print my project report?",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain("Please send the PDF file");
    expect(text).not.toContain("I understand. For this demo");
  });

  it("redirects unrelated questions to print-order help", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999975",
      MessageSid: "SM_ADAPTIVE_UNRELATED",
      Body: "what is the weather today?",
      NumMedia: "0"
    });

    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
      env
    );

    const text = await response.text();
    expect(text).toContain("print");
    expect(await store.listOrders()).toHaveLength(0);
  });

  it("recovers earlier PDF caption specs when missing details arrive later", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999981" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    const caption = await store.createMessage({
      customerId: customer.id,
      orderId: order.id,
      direction: "inbound",
      provider: "twilio_sandbox",
      processingStatus: "completed",
      providerMessageId: "SM_LEGACY_CAPTION",
      body: "Use this one with black and white printing, four pages per sheet. I want two copies.",
      mediaCount: 1,
      rawPayloadJson: "{}"
    });
    await store.attachMessageToOrder(caption.id, order.id);
    await store.addOrderFile({
      orderId: order.id,
      originalFilename: "notes.pdf",
      mimeType: "application/pdf",
      r2Key: "orders/legacy/notes.pdf",
      pageCount: 284,
      fileSizeBytes: 1000
    });
    order = await store.updatePrintOptions(order.id, {
      copies: 2,
      colorMode: "black_and_white",
      pageCount: 284
    });
    await store.transitionOrder(order.id, "AWAITING_DETAILS");

    const sides = new URLSearchParams({
      From: "whatsapp:+919999999981",
      MessageSid: "SM_LEGACY_SIDE_REPLY",
      Body: "single-sided",
      NumMedia: "0"
    });
    const response = await app.request(
      "/webhooks/whatsapp",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: sides },
      env
    );

    const text = await response.text();
    expect(text).toContain("Pages: 284");
    expect(text).toContain("Copies: 2");
    expect(text).toContain("Layout: 4-up");
    expect(text).toContain("Billable sheets: 142");
    expect((await store.getOrder(order.id))?.printOptions.pagesPerSheet).toBe(4);
  });

  it("does not create a separate order when the same customer sends another PDF after payment link is sent", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const first = new URLSearchParams({
      From: "whatsapp:+919999999990",
      MessageSid: "SM_MULTI_ORDER_001",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/first.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "18"
    });
    const second = new URLSearchParams({
      From: "whatsapp:+919999999990",
      MessageSid: "SM_MULTI_ORDER_002",
      Body: "1 copy color single sided staple pickup at 6",
      NumMedia: "1",
      MediaUrl0: "https://example.test/second.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "8"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: first }, env);
    const confirmFirst = new URLSearchParams({
      From: "whatsapp:+919999999990",
      MessageSid: "SM_MULTI_ORDER_CONFIRM_001",
      Body: "Confirm",
      NumMedia: "0"
    });
    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: confirmFirst }, env);
    const secondResponse = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: second }, env);

    const orders = await store.listOrders();
    expect(await secondResponse.text()).toContain("cannot automatically change");
    expect(orders).toHaveLength(1);
    expect(orders[0].customerWhatsappNumber).toBe("whatsapp:+919999999990");
    expect(orders[0].status).toBe("PAYMENT_LINK_SENT");
  });

  it("reuses an active order waiting for a file when the same customer sends the missing PDF", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const detailsOnly = new URLSearchParams({
      From: "whatsapp:+919999999989",
      MessageSid: "SM_WAITING_FILE_001",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "0"
    });
    const missingPdf = new URLSearchParams({
      From: "whatsapp:+919999999989",
      MessageSid: "SM_WAITING_FILE_002",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/file.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "18"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: detailsOnly }, env);
    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: missingPdf }, env);

    const orders = await store.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].files).toHaveLength(1);
    expect(orders[0].status).toBe("QUOTE_READY");
  });

  it("does not reprocess duplicate inbound provider message IDs", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999997",
      MessageSid: "SM_DUPLICATE",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/file.pdf",
      MediaContentType0: "application/pdf",
      pageCount: "18"
    });

    await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, env);
    const second = await app.request("/webhooks/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, env);

    expect(await second.text()).toContain("Already received this message.");
    expect(await store.listOrders()).toHaveLength(1);
  });

  it("verifies Twilio signatures when an auth token is configured", async () => {
    const body = new URLSearchParams({
      From: "whatsapp:+919999999996",
      Body: "hello"
    });
    const url = "http://localhost:8787/webhooks/whatsapp";
    const signature = await hmacSha1Base64(`${url}BodyhelloFromwhatsapp:+919999999996`, "twilio-secret");
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature
      },
      body
    });

    await expect(verifyTwilioSignature(request, "twilio-secret", "http://localhost:8787")).resolves.toBe(true);
  });

  it("verifies Meta webhook challenge tokens", async () => {
    const app = createApp(new MemoryTobiStore());
    const metaEnv = {
      ...env,
      WHATSAPP_VERIFY_TOKEN: "verify-token",
    } as unknown as Env;

    const response = await app.request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-code",
      {},
      metaEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-code");
  });

  it("accepts Meta WhatsApp messages and sends replies through Graph API", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: Array<{ url: string; body: MetaSendBody }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("graph.facebook.com")) {
        graphRequests.push({
          url,
          body: JSON.parse(String(init?.body)) as MetaSendBody,
        });
        return Response.json({ messages: [{ id: "wamid.OUTBOUND" }] });
      }
      return new Response(pdfWithPages(1), {
        headers: { "content-type": "application/pdf" },
      });
    }) as typeof fetch;

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          object: "whatsapp_business_account",
          entry: [
            {
              id: "35754282604220160",
              changes: [
                {
                  field: "messages",
                  value: {
                    messaging_product: "whatsapp",
                    metadata: { phone_number_id: "1052415724631354" },
                    contacts: [
                      {
                        wa_id: "919999999970",
                        profile: { name: "Meta Tester" },
                      },
                    ],
                    messages: [
                      {
                        from: "919999999970",
                        id: "wamid.INBOUND",
                        timestamp: "1710000000",
                        type: "text",
                        text: { body: "hello" },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      },
      metaEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: false });
    const graphRequest = graphRequests[0];
    expect(graphRequest?.url).toBe("https://graph.facebook.com/v25.0/1052415724631354/messages");
    expect(graphRequest?.body).toMatchObject({
      messaging_product: "whatsapp",
      to: "919999999970",
      type: "text",
      text: {
        preview_url: false,
      },
    });
    expect(graphRequest?.body.text?.body).toContain("What would you like to print today");
    expect(await store.listOrders()).toHaveLength(0);
  });

  it("retries Meta replies when the Graph API send fails", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: MetaSendBody[] = [];
    let attempt = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;
      graphRequests.push(JSON.parse(String(init?.body)) as MetaSendBody);
      if (attempt === 1) {
        return Response.json({ error: { message: "temporary failure" } }, { status: 500 });
      }
      return Response.json({ messages: [{ id: "wamid.OUTBOUND_RETRY" }] });
    }) as typeof fetch;
    const payload = metaTextPayload("919999999968", "wamid.RETRY", "hello");

    const first = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      metaEnv,
    );
    expect(first.status).toBe(500);
    expect((await store.findMessageByProviderId("wamid.RETRY"))?.processingStatus).toBe("failed");

    const second = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      metaEnv,
    );

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, duplicate: false });
    expect(graphRequests).toHaveLength(2);
    expect((await store.findMessageByProviderId("wamid.RETRY"))?.processingStatus).toBe("completed");
  });

  it("does not duplicate a PDF order when retrying after a Meta reply send failure", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: MetaSendBody[] = [];
    let sendAttempt = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("graph.facebook.com") && url.endsWith("/messages")) {
        sendAttempt += 1;
        graphRequests.push(JSON.parse(String(init?.body)) as MetaSendBody);
        if (sendAttempt === 1) {
          return Response.json({ error: { message: "temporary failure" } }, { status: 500 });
        }
        return Response.json({ messages: [{ id: "wamid.OUTBOUND_RETRY_PDF" }] });
      }
      if (url.includes("graph.facebook.com")) {
        return Response.json({ url: "https://lookaside.fbsbx.com/whatsapp-media/retry.pdf" });
      }
      return new Response(pdfWithPages(12), {
        headers: { "content-type": "application/pdf" },
      });
    }) as typeof fetch;
    const payload = metaDocumentPayload(
      "919999999967",
      "wamid.RETRY_PDF",
      "retry.pdf",
      "black and white double sided",
    );

    const first = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      metaEnv,
    );
    expect(first.status).toBe(500);

    const second = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      metaEnv,
    );

    const orders = await store.listOrders();
    expect(second.status).toBe(200);
    expect(orders).toHaveLength(1);
    expect(orders[0].files).toHaveLength(1);
    expect(graphRequests).toHaveLength(2);
    expect(graphRequests[1]?.type).toBe("interactive");
    expect(graphRequests[1]?.interactive?.body.text).toContain("Please confirm your print order");
    expect(graphRequests[1]?.interactive?.body.text).toContain("Copies: 1");
    expect(graphRequests[1]?.interactive?.body.text).toContain("Color: black and white");
    expect(graphRequests[1]?.interactive?.body.text).toContain("Sides: double sided");
    expect((await store.findMessageByProviderId("wamid.RETRY_PDF"))?.processingStatus).toBe("completed");
  });

  it("uses Meta document captions as print instructions", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: Array<{ url: string; body: MetaSendBody }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("graph.facebook.com") && url.endsWith("/messages")) {
        graphRequests.push({
          url,
          body: JSON.parse(String(init?.body)) as MetaSendBody,
        });
        return Response.json({ messages: [{ id: `wamid.OUTBOUND_${graphRequests.length}` }] });
      }
      if (url.includes("graph.facebook.com")) {
        return Response.json({ url: "https://lookaside.fbsbx.com/whatsapp-media/tobi-test.pdf" });
      }
      return new Response(pdfWithPages(15), {
        headers: { "content-type": "application/pdf" },
      });
    }) as typeof fetch;

    const upload = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          metaDocumentPayload(
            "919999999969",
            "wamid.DOC_CAPTION",
            "Tobi_test.pdf",
            "I want the printout to be black and white, double-sided, with four pages per sheet, and no spiral binding.",
          ),
        ),
      },
      metaEnv,
    );

    expect(upload.status).toBe(200);
    expect(graphRequests[0]?.body.type).toBe("interactive");
    expect(graphRequests[0]?.body.interactive?.body.text).toContain("Please confirm your print order");
    expect(graphRequests[0]?.body.interactive?.body.text).toContain("Copies: 1");
    const [draftOrder] = await store.listOrders();
    expect(draftOrder.printOptions).toMatchObject({
      pageCount: 15,
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "double_sided",
      pagesPerSheet: 4,
      bindingType: "staple",
    });

    const copies = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metaTextPayload("919999999969", "wamid.COPIES", "three")),
      },
      metaEnv,
    );

    expect(copies.status).toBe(200);
    expect(graphRequests[1]?.body.type).toBe("interactive");
    expect(graphRequests[1]?.body.interactive?.body.text).toContain("Please confirm your print order");
    expect(graphRequests[1]?.body.interactive?.body.text).toContain("Copies: 3");
    expect(graphRequests[1]?.body.interactive?.body.text).toContain("Color: black and white");
    expect(graphRequests[1]?.body.interactive?.body.text).toContain("Layout: 4-up");
    expect(graphRequests[1]?.body.interactive?.body.text).not.toContain("black and white or color");
    expect((await store.getOrder(draftOrder.id))?.printOptions.copies).toBe(3);
  });

  it("sends Meta quote confirmation as interactive buttons", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999971" });
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
      pageCount: 10,
      copies: 1,
      colorMode: "black_and_white",
      sideMode: "single_sided",
    });
    await store.setQuote(order.id, {
      pages: 10,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 10,
      lineItems: [{ label: "Printing", amountPaise: 2000 }],
      totalPaise: 2200,
      currency: "INR",
    });
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: Array<{ url: string; body: MetaSendBody }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      graphRequests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as MetaSendBody,
      });
      return Response.json({ messages: [{ id: "wamid.OUTBOUND_BUTTONS" }] });
    }) as typeof fetch;

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metaTextPayload("919999999971", "wamid.ASK_QUOTE", "how much now?")),
      },
      metaEnv,
    );

    expect(response.status).toBe(200);
    expect(graphRequests[0]?.body).toMatchObject({
      messaging_product: "whatsapp",
      to: "919999999971",
      type: "interactive",
      interactive: {
        type: "button",
        action: {
          buttons: [
            { type: "reply", reply: { id: "confirm_quote", title: "Confirm" } },
            { type: "reply", reply: { id: "cancel_order", title: "Cancel" } },
          ],
        },
      },
    });
    expect(graphRequests[0]?.body.interactive?.body.text).toContain("Please confirm your print order");
  });

  it("accepts Meta interactive confirm button replies", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999972" });
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
      pageCount: 10,
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
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: Array<{ url: string; body: MetaSendBody }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      graphRequests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as MetaSendBody,
      });
      return Response.json({ messages: [{ id: "wamid.OUTBOUND_PAYMENT" }] });
    }) as typeof fetch;

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metaButtonReplyPayload("919999999972", "wamid.CONFIRM", "confirm_quote", "Confirm")),
      },
      metaEnv,
    );

    expect(response.status).toBe(200);
    expect((await store.getOrder(order.id))?.status).toBe("PAYMENT_LINK_SENT");
    expect(graphRequests[0]?.body).toMatchObject({
      to: "919999999972",
      type: "text",
    });
    expect(graphRequests[0]?.body.text?.body).toContain(`Confirmed ${order.publicId}`);
    expect(graphRequests[0]?.body.text?.body).toContain("Pay here:");
  });

  it("accepts Meta button payload confirm replies", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999973" });
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
      pageCount: 10,
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
    const metaEnv = {
      ...env,
      WHATSAPP_ACCESS_TOKEN: "test-meta-token",
      WHATSAPP_PHONE_NUMBER_ID: "1052415724631354",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
    } as unknown as Env;
    const graphRequests: Array<{ url: string; body: MetaSendBody }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      graphRequests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as MetaSendBody,
      });
      return Response.json({ messages: [{ id: "wamid.OUTBOUND_PAYMENT" }] });
    }) as typeof fetch;

    const response = await app.request(
      "/webhooks/whatsapp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metaButtonPayload("919999999973", "wamid.CONFIRM_BUTTON", "confirm_quote", "Confirm")),
      },
      metaEnv,
    );

    expect(response.status).toBe(200);
    expect((await store.getOrder(order.id))?.status).toBe("PAYMENT_LINK_SENT");
    expect(graphRequests[0]?.body.text?.body).toContain(`Confirmed ${order.publicId}`);
    expect(graphRequests[0]?.body.text?.body).toContain("Pay here:");
  });

  it("marks an order paid exactly once from signed Razorpay webhook", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999999" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    order = await store.updatePrintOptions(order.id, {
      pageCount: 18,
      copies: 2,
      colorMode: "black_and_white",
      sideMode: "double_sided",
      bindingType: "spiral"
    });
    order = await store.setQuote(order.id, {
      pages: 18,
      copies: 2,
      pagesPerSheet: 1,
      billableSheets: 18,
      totalPaise: 8900,
      currency: "INR",
      lineItems: [{ label: "Printing", amountPaise: 2700 }]
    });
    order = await store.setPaymentRequest(order.id, {
      provider: "razorpay_test",
      paymentLinkId: "plink_test",
      paymentLink: "https://rzp.io/i/test",
      amountPaise: 8900
    });

    const payload = JSON.stringify({
      event: "payment_link.paid",
      event_id: "evt_paid_once",
      payload: {
        payment_link: {
          entity: {
            id: "plink_test",
            status: "paid",
            notes: { orderId: order.id, publicId: order.publicId },
            payments: [{ payment_id: "pay_test" }]
          }
        }
      }
    });
    const signature = await hmacSha256Hex(payload, env.RAZORPAY_WEBHOOK_SECRET as string);

    const first = await app.request(
      "/webhooks/razorpay",
      { method: "POST", headers: { "x-razorpay-signature": signature }, body: payload },
      env
    );
    expect(await first.json()).toMatchObject({ ok: true, duplicate: false });
    expect((await store.getOrder(order.id))?.status).toBe("SHOP_NOTIFIED");

    const second = await app.request(
      "/webhooks/razorpay",
      { method: "POST", headers: { "x-razorpay-signature": signature }, body: payload },
      env
    );
    expect(await second.json()).toMatchObject({ ok: true, duplicate: true });
    expect((await store.getOrder(order.id))?.paymentId).toBe("pay_test");
  });

  it("does not move a shop-notified order back to paid for another success event", async () => {
    const store = new MemoryTobiStore();
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919999999995" });
    let order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    order = await store.setQuote(order.id, {
      pages: 1,
      copies: 1,
      pagesPerSheet: 1,
      billableSheets: 1,
      totalPaise: 200,
      currency: "INR",
      lineItems: [{ label: "Printing", amountPaise: 200 }]
    });
    order = await store.setPaymentRequest(order.id, {
      provider: "razorpay_test",
      paymentLinkId: "plink_again",
      paymentLink: "https://rzp.io/i/again",
      amountPaise: 200
    });
    await store.applyPaymentEvent({
      eventId: "evt_one",
      eventType: "payment_link.paid",
      orderId: order.id,
      paymentLinkId: "plink_again",
      paymentId: "pay_one",
      status: "succeeded",
      rawPayloadJson: "{}"
    });
    const claim = await store.claimShopNotification(order.id);
    expect(claim.claimed).toBe(true);

    await store.applyPaymentEvent({
      eventId: "evt_two",
      eventType: "payment.captured",
      orderId: order.id,
      paymentLinkId: "plink_again",
      paymentId: "pay_one",
      status: "succeeded",
      rawPayloadJson: "{}"
    });

    expect((await store.getOrder(order.id))?.status).toBe("SHOP_NOTIFIED");
    const secondClaim = await store.claimShopNotification(order.id);
    expect(secondClaim.claimed).toBe(false);
  });

  it("renders dashboard login and orders after PIN auth", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);

    const login = await app.request("/dashboard/login", {}, env);
    expect(await login.text()).toContain("Enter admin PIN");

    const auth = await app.request(
      "/dashboard/login",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ pin: "123456" }),
        redirect: "manual"
      },
      env
    );
    const cookie = auth.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("tobi_admin=test-session");

    const orders = await app.request("/dashboard/orders", { headers: { cookie } }, env);
    expect(await orders.text()).toContain("Orders");
  });

  it("shows customer WhatsApp contact on dashboard orders and details", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const customer = await store.upsertCustomer({ whatsappNumber: "whatsapp:+919876543210" });
    const order = await store.createOrder({ customerId: customer.id, shopId: "shop_demo" });
    const cookie = "tobi_admin=test-session";

    const orders = await app.request("/dashboard/orders", { headers: { cookie } }, env);
    expect(await orders.text()).toContain("whatsapp:+919876543210");

    const detail = await app.request(`/dashboard/orders/${order.id}`, { headers: { cookie } }, env);
    const html = await detail.text();
    expect(html).toContain("Customer Contact");
    expect(html).toContain("whatsapp:+919876543210");
  });
});

async function hmacSha1Base64(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Buffer.from(signature).toString("base64");
}

function metaTextPayload(from: string, id: string, body: string): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: from, profile: { name: "Meta Tester" } }],
              messages: [
                {
                  from,
                  id,
                  timestamp: "1710000000",
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function metaButtonReplyPayload(
  from: string,
  id: string,
  buttonId: string,
  title: string,
): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: from, profile: { name: "Meta Tester" } }],
              messages: [
                {
                  from,
                  id,
                  timestamp: "1710000000",
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id: buttonId, title },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function metaButtonPayload(
  from: string,
  id: string,
  payload: string,
  text: string,
): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: from, profile: { name: "Meta Tester" } }],
              messages: [
                {
                  from,
                  id,
                  timestamp: "1710000000",
                  type: "button",
                  button: { payload, text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function metaDocumentPayload(
  from: string,
  id: string,
  filename: string,
  caption: string,
): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: from, profile: { name: "Meta Tester" } }],
              messages: [
                {
                  from,
                  id,
                  timestamp: "1710000000",
                  type: "document",
                  document: {
                    id: "MEDIA_DOC_CAPTION",
                    filename,
                    caption,
                    mime_type: "application/pdf",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

type MetaSendBody = {
  messaging_product: string;
  to: string;
  type: "text" | "interactive";
  text?: {
    preview_url: boolean;
    body: string;
  };
  interactive?: {
    type: "button";
    body: { text: string };
    action: {
      buttons: Array<{
        type: "reply";
        reply: {
          id: string;
          title: string;
        };
      }>;
    };
  };
};
