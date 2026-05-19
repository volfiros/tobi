import { createApp } from "../src/app";
import { MemoryTobiStore } from "../src/store";
import { hmacSha256Hex } from "../src/services/razorpay";
import { verifyTwilioSignature } from "../src/services/whatsapp";

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
  globalThis.fetch = (async () =>
    new Response("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF", {
      headers: { "content-type": "application/pdf" }
    })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Tobi app", () => {
  it("responds to health checks", async () => {
    const app = createApp(new MemoryTobiStore());
    const response = await app.request("/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, service: "tobi" });
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
    expect(text).toContain("Quote for TOBI-");
    expect(text).toContain("Pay here:");

    const [order] = await store.listOrders();
    expect(order.status).toBe("PAYMENT_LINK_SENT");
    expect(order.paymentLink).toContain("/demo/pay/");
    expect(order.totalPaise).toBe(8900);
  });

  it("counts PDF pages from stored media when webhook does not provide page count", async () => {
    const store = new MemoryTobiStore();
    const app = createApp(store);
    const body = new URLSearchParams({
      From: "whatsapp:+919999999998",
      Body: "2 copies B&W spiral double sided pickup at 5",
      NumMedia: "1",
      MediaUrl0: "https://example.test/file.pdf",
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
