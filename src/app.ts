import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Order, OrderStatus } from "./domain";
import {
  createCustomerPaymentConfirmation,
  createShopNotification,
} from "./services/notifications";
import { RazorpayPaymentService } from "./services/razorpay";
import { handleInboundWorkflow } from "./services/messageWorkflow";
import { demoPaymentPage, loginPage, orderDetailPage, ordersPage, pageShell } from "./dashboard";
import { dashboardCss } from "./dashboardStyles";
import {
  parseInboundMetaWhatsApp,
  sendMetaWhatsAppInteractiveButtons,
  sendMetaWhatsAppText,
  verifyMetaSignature,
  verifyMetaWebhookChallenge,
  type WhatsAppProvider,
} from "./services/whatsapp";
import {
  parseInboundWhatsApp,
  twimlMessage,
  verifyTwilioSignature,
} from "./services/twilio";
import { createStore, type TobiStore } from "./store";

type AppVariables = {
  store: TobiStore;
};

type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export function createApp(
  store?: TobiStore,
): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use("*", async (context, next) => {
    context.set("store", store ?? createStore(context.env));
    await next();
  });

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "tobi",
      environment: context.env.APP_ENV ?? "test",
    }),
  );

  app.get(
    "/demo/sample.pdf",
    () =>
      new Response(
        "%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF",
        {
          headers: { "content-type": "application/pdf" },
        },
      ),
  );

  app.post("/webhooks/whatsapp", async (context) => {
    const contentType = context.req.header("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return handleMetaWhatsAppWebhook(context);
    }

    if (context.env.TWILIO_AUTH_TOKEN) {
      const verified = await verifyTwilioSignature(
        context.req.raw,
        context.env.TWILIO_AUTH_TOKEN,
        context.env.PUBLIC_APP_URL,
      );
      if (!verified) return context.text("Invalid Twilio signature", 401);
    } else if (context.env.APP_ENV === "production") {
      return context.text("TWILIO_AUTH_TOKEN is required in production", 500);
    }

    const inbound = await parseInboundWhatsApp(context.req.raw);
    const result = await processInboundWhatsAppMessage(context, inbound, "twilio_sandbox");
    if (result.duplicate)
      return twimlMessage("Already received this message.");
    return twimlMessage(result.reply);
  });

  app.get("/webhooks/whatsapp", (context) =>
    verifyMetaWebhookChallenge(
      new URL(context.req.url),
      context.env.WHATSAPP_VERIFY_TOKEN,
    ),
  );

  app.post("/webhooks/razorpay", async (context) => {
    const store = context.get("store");
    const paymentService = new RazorpayPaymentService(context.env);
    const event = await paymentService.verifyWebhook(context.req.raw);
    const result = await store.applyPaymentEvent(event);
    await store.addOrderEvent(
      result.order.id,
      result.duplicate
        ? "payment_webhook_duplicate"
        : "payment_webhook_applied",
      event,
    );
    if (!result.duplicate && result.order.status === "PAID") {
      const notificationClaim = await store.claimShopNotification(
        result.order.id,
      );
      if (notificationClaim.claimed) {
        await createShopNotification(store, notificationClaim.order);
        await createCustomerPaymentConfirmation(store, notificationClaim.order);
      }
    }
    return context.json({ ok: true, duplicate: result.duplicate });
  });

  app.get("/orders/:publicId", async (context) => {
    const order = await context
      .get("store")
      .getOrderByPublicId(context.req.param("publicId"));
    if (!order) return context.notFound();
    return context.json(publicOrder(order));
  });

  app.get("/demo/pay/:publicId", async (context) => {
    const order = await context
      .get("store")
      .getOrderByPublicId(context.req.param("publicId"));
    if (!order) return context.notFound();
    return context.html(demoPaymentPage(order));
  });

  app.get("/", (context) => context.redirect("/dashboard/orders"));
  app.get("/dashboard/styles.css", (context) =>
    new Response(dashboardCss, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }),
  );
  app.get("/dashboard/login", (context) => context.html(loginPage()));
  app.post("/dashboard/login", async (context) => {
    const form = await context.req.formData();
    const pin = String(form.get("pin") ?? "");
    if (pin !== (context.env.ADMIN_PIN ?? "123456")) {
      return context.html(loginPage("Invalid PIN"), 401);
    }
    setCookie(
      context,
      "tobi_admin",
      context.env.ADMIN_SESSION_TOKEN ?? "dev-session",
      {
        httpOnly: true,
        sameSite: "Lax",
        path: "/dashboard",
        secure: context.env.APP_ENV === "production",
      },
    );
    return context.redirect("/dashboard/orders");
  });

  app.use("/dashboard/*", async (context, next) => {
    if (context.req.path === "/dashboard/login") return next();
    const token = getCookie(context, "tobi_admin");
    if (token !== (context.env.ADMIN_SESSION_TOKEN ?? "dev-session"))
      return context.redirect("/dashboard/login");
    await next();
  });

  app.get("/dashboard/orders", async (context) => {
    const orders = await context.get("store").listOrders();
    return context.html(pageShell("Orders", ordersPage(orders)));
  });

  app.get("/dashboard/orders/:id", async (context) => {
    const order = await context.get("store").getOrder(context.req.param("id"));
    if (!order) return context.notFound();
    return context.html(pageShell(order.publicId, orderDetailPage(order)));
  });

  app.post("/dashboard/orders/:id/status", async (context) => {
    const form = await context.req.formData();
    const status = String(form.get("status")) as OrderStatus;
    const order = await context
      .get("store")
      .transitionOrder(context.req.param("id"), status);
    await context
      .get("store")
      .addOrderEvent(order.id, "shop_status_update", { status });
    return context.redirect(`/dashboard/orders/${order.id}`);
  });

  app.get("/dashboard/orders/:id/files/:fileId/download", async (context) => {
    const order = await context.get("store").getOrder(context.req.param("id"));
    if (!order) return context.notFound();
    const file = order.files.find(
      (candidate) => candidate.id === context.req.param("fileId"),
    );
    if (!file) return context.notFound();
    const object = await context.env.FILES.get(file.r2Key);
    if (!object) return context.notFound();
    return new Response(object.body, {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": `attachment; filename="${file.originalFilename ?? "document.pdf"}"`,
        "cache-control": "private, max-age=60",
      },
    });
  });

  return app;
}

async function handleMetaWhatsAppWebhook(context: AppContext): Promise<Response> {
  if (context.env.WHATSAPP_APP_SECRET) {
    const verified = await verifyMetaSignature(
      context.req.raw,
      context.env.WHATSAPP_APP_SECRET,
    );
    if (!verified) return context.text("Invalid Meta signature", 401);
  }

  const inbound = await parseInboundMetaWhatsApp(context.req.raw);
  if (!inbound) return context.json({ ok: true, ignored: true });
  const result = await processInboundWhatsAppMessage(
    context,
    inbound,
    "meta_cloud_api",
  );
  if (!result.duplicate) {
    const providerMessageId = result.actions?.length
      ? await sendMetaWhatsAppInteractiveButtons(
          context.env,
          inbound.from,
          result.reply,
          result.actions,
        )
      : await sendMetaWhatsAppText(
          context.env,
          inbound.from,
          result.reply,
        );
    await context.get("store").createMessage({
      customerId: result.customerId,
      orderId: result.orderId,
      direction: "outbound",
      provider: "meta_cloud_api",
      processingStatus: "completed",
      providerMessageId,
      body: result.reply,
      mediaCount: 0,
      rawPayloadJson: JSON.stringify({
        flow: "message_workflow",
        audit: result.audit,
        actions: result.actions ?? [],
      }),
    });
  }
  return context.json({ ok: true, duplicate: result.duplicate });
}

async function processInboundWhatsAppMessage(
  context: AppContext,
  inbound: Awaited<ReturnType<typeof parseInboundWhatsApp>>,
  provider: WhatsAppProvider,
): Promise<{
  customerId: string;
  orderId: string | null;
  reply: string;
  actions?: Awaited<ReturnType<typeof handleInboundWorkflow>>["actions"];
  audit: Record<string, unknown>;
  duplicate: boolean;
}> {
  const store = context.get("store");
  const inboundMessage = await store.tryCreateMessage({
    customerId: null,
    orderId: null,
    direction: "inbound",
    provider,
    processingStatus: "processing",
    providerMessageId: inbound.providerMessageId,
    body: inbound.body,
    mediaCount: inbound.media.length,
    rawPayloadJson: JSON.stringify(inbound.raw),
  });
  const customer = await store.upsertCustomer({
    whatsappNumber: inbound.from,
    displayName: inbound.senderName,
  });
  if (inboundMessage.duplicate) {
    return {
      customerId: customer.id,
      orderId: inboundMessage.message.orderId,
      reply: "Already received this message.",
      audit: { duplicate: true, provider },
      duplicate: true,
    };
  }

  const activeOrder = await store.findActiveOrder(customer.id);
  let result;
  try {
    result = await handleInboundWorkflow({
      store,
      env: context.env,
      customer,
      inboundMessage: inboundMessage.message,
      inbound,
      activeOrder,
    });
  } catch (error) {
    await store.markMessageProcessed(inboundMessage.message.id, "failed");
    throw error;
  }
  if (result.orderId) {
    await store.attachMessageToOrder(
      inboundMessage.message.id,
      result.orderId,
    );
    await store.addOrderEvent(
      result.orderId,
      "message_understanding_applied",
      result.audit,
    );
  }
  if (provider === "twilio_sandbox") {
    await store.createMessage({
      customerId: customer.id,
      orderId: result.orderId,
      direction: "outbound",
      provider: "demo",
      processingStatus: "completed",
      providerMessageId: null,
      body: result.reply,
      mediaCount: 0,
      rawPayloadJson: JSON.stringify({
        flow: "message_workflow",
        audit: result.audit,
      }),
    });
  }
  await store.markMessageProcessed(inboundMessage.message.id, "completed");
  return {
    customerId: customer.id,
    orderId: result.orderId,
    reply: result.reply,
    actions: result.actions,
    audit: result.audit,
    duplicate: false,
  };
}

function publicOrder(order: Order): Record<string, unknown> {
  return {
    publicId: order.publicId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    pickupCode: order.pickupCode,
  };
}
