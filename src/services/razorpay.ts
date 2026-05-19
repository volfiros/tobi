import type { Order, PaymentEvent, PaymentRequest } from "../domain";

export class RazorpayPaymentService {
  constructor(
    private readonly env: Pick<
      Env,
      "PUBLIC_APP_URL" | "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"
    >
  ) {}

  async createPaymentRequest(order: Order): Promise<PaymentRequest> {
    if (!order.quoteSnapshot || order.totalPaise <= 0) {
      throw new Error("Order must have a quote before creating payment link");
    }

    if (!this.env.RAZORPAY_KEY_ID || !this.env.RAZORPAY_KEY_SECRET) {
      return {
        provider: "razorpay_test",
        paymentLinkId: `plink_demo_${order.id}`,
        paymentLink: `${this.env.PUBLIC_APP_URL}/demo/pay/${order.publicId}`,
        amountPaise: order.totalPaise
      };
    }

    const credentials = btoa(`${this.env.RAZORPAY_KEY_ID}:${this.env.RAZORPAY_KEY_SECRET}`);
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: order.totalPaise,
        currency: "INR",
        description: `Tobi print order ${order.publicId}`,
        reference_id: order.publicId,
        callback_url: `${this.env.PUBLIC_APP_URL}/orders/${order.publicId}`,
        callback_method: "get",
        notes: {
          orderId: order.id,
          publicId: order.publicId
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Razorpay payment link creation failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as {
      id: string;
      short_url: string;
      amount: number;
    };

    return {
      provider: "razorpay_test",
      paymentLinkId: payload.id,
      paymentLink: payload.short_url,
      amountPaise: payload.amount
    };
  }

  async verifyWebhook(request: Request): Promise<PaymentEvent> {
    const rawPayloadJson = await request.text();
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    if (!this.env.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error("RAZORPAY_WEBHOOK_SECRET is required for webhook verification");
    }
    const expected = await hmacSha256Hex(rawPayloadJson, this.env.RAZORPAY_WEBHOOK_SECRET);
    if (!timingSafeEqual(signature, expected)) {
      throw new Error("Invalid Razorpay webhook signature");
    }

    const payload = JSON.parse(rawPayloadJson) as RazorpayWebhookPayload;
    const paymentLink = payload.payload.payment_link?.entity;
    const payment = payload.payload.payment?.entity;
    const orderId = paymentLink?.notes?.orderId ?? payment?.notes?.orderId;
    if (!orderId) {
      throw new Error("Razorpay webhook missing notes.orderId");
    }

    return {
      eventId: payload.event_id ?? `${payload.event}:${paymentLink?.id ?? payment?.id ?? crypto.randomUUID()}`,
      eventType: payload.event,
      orderId,
      paymentLinkId: paymentLink?.id ?? "",
      paymentId: payment?.id ?? paymentLink?.payments?.[0]?.payment_id ?? null,
      status: mapWebhookStatus(payload.event),
      rawPayloadJson
    };
  }
}

type RazorpayWebhookPayload = {
  event: string;
  event_id?: string;
  payload: {
    payment_link?: {
      entity: {
        id: string;
        status: string;
        notes?: { orderId?: string; publicId?: string };
        payments?: Array<{ payment_id?: string }>;
      };
    };
    payment?: {
      entity: {
        id: string;
        status: string;
        notes?: { orderId?: string; publicId?: string };
      };
    };
  };
};

function mapWebhookStatus(event: string): PaymentEvent["status"] {
  if (event === "payment_link.paid" || event === "payment.captured") return "succeeded";
  if (event === "payment_link.expired") return "expired";
  if (event === "payment_link.cancelled") return "cancelled";
  if (event === "payment.failed") return "failed";
  return "pending";
}

export async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}
