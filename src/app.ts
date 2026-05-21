import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Order, OrderStatus, PrintOrderExtraction, PrintOptions } from "./domain";
import { calculateQuote, formatPaise } from "./services/pricing";
import { createAIProvider, type AIProvider } from "./services/extraction";
import {
  activeOrderSummary,
  confirmationSummary,
  isCancelReply,
  isConfirmReply,
} from "./services/orderMessages";
import {
  createCustomerPaymentConfirmation,
  createShopNotification,
} from "./services/notifications";
import { storeInboundPdf } from "./services/pdf";
import { RazorpayPaymentService } from "./services/razorpay";
import {
  canTransition,
  nextMissingField,
  questionForMissingField,
} from "./services/stateMachine";
import {
  parseInboundWhatsApp,
  twimlMessage,
  verifyTwilioSignature,
} from "./services/whatsapp";
import { createStore, type TobiStore } from "./store";
import { label } from "./utils/labels";

type AppVariables = {
  store: TobiStore;
};

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

    const store = context.get("store");
    const inbound = await parseInboundWhatsApp(context.req.raw);
    const inboundMessage = await store.tryCreateMessage({
      customerId: null,
      orderId: null,
      direction: "inbound",
      provider: "twilio_sandbox",
      processingStatus: "processing",
      providerMessageId: inbound.providerMessageId,
      body: inbound.body,
      mediaCount: inbound.media.length,
      rawPayloadJson: JSON.stringify(inbound.raw),
    });
    if (inboundMessage.duplicate)
      return twimlMessage("Already received this message.");
    const customer = await store.upsertCustomer({
      whatsappNumber: inbound.from,
    });
    const activeOrder = await store.findActiveOrder(customer.id);
    const confirmationReply = await handleQuoteConfirmation({
      store,
      env: context.env,
      activeOrder,
      inboundBody: inbound.body,
    });
    if (confirmationReply) {
      await store.createMessage({
        customerId: customer.id,
        orderId: activeOrder?.id ?? null,
        direction: "outbound",
        provider: "demo",
        processingStatus: "completed",
        providerMessageId: null,
        body: confirmationReply,
        mediaCount: 0,
        rawPayloadJson: JSON.stringify({ flow: "quote_confirmation" }),
      });
      await store.markMessageProcessed(inboundMessage.message.id, "completed");
      return twimlMessage(confirmationReply);
    }
    const inboundHasPdf = inbound.media.some((media) =>
      media.contentType.includes("pdf"),
    );
    const ai = createAIProvider(context.env);
    const initialExtraction = await ai.extractPrintOrder({
      body: inbound.body,
      hasFile: inboundHasPdf,
    });
    const conversationalReply = await replyForNonOrderIntent({
      store,
      ai,
      activeOrder,
      extraction: initialExtraction,
      inboundBody: inbound.body,
      inboundHasPdf,
    });
    if (conversationalReply) {
      await store.createMessage({
        customerId: customer.id,
        orderId: activeOrder?.id ?? null,
        direction: "outbound",
        provider: "demo",
        processingStatus: "completed",
        providerMessageId: null,
        body: conversationalReply,
        mediaCount: 0,
        rawPayloadJson: JSON.stringify({ intent: initialExtraction.intent }),
      });
      await store.markMessageProcessed(inboundMessage.message.id, "completed");
      return twimlMessage(conversationalReply);
    }
    let order = shouldReuseActiveOrder(activeOrder, inboundHasPdf)
      ? activeOrder
      : await store.createOrder({
        customerId: customer.id,
        shopId: context.env.DEMO_SHOP_ID ?? "shop_demo",
      });
    await store.attachMessageToOrder(inboundMessage.message.id, order.id);

    try {
      for (const [index, media] of inbound.media.entries()) {
        if (!media.contentType.includes("pdf")) continue;
        const stored = await storeInboundPdf(
          context.env,
          media.url,
          `orders/${order.id}/upload-${index + 1}.pdf`,
          media.contentType,
        );
        await store.addOrderFile({
          orderId: order.id,
          originalFilename: media.filename ?? `upload-${index + 1}.pdf`,
          mimeType: media.contentType,
          r2Key: stored.r2Key,
          pageCount: media.pageCount ?? stored.pageCount,
          fileSizeBytes: media.sizeBytes ?? stored.fileSizeBytes,
        });
      }
    } catch (error) {
      await store.markMessageProcessed(inboundMessage.message.id, "failed");
      throw error;
    }

    order = (await store.getOrder(order.id)) ?? order;
    const extraction =
      inboundHasPdf === (order.files.length > 0)
        ? initialExtraction
        : await ai.extractPrintOrder({
            body: inbound.body,
            hasFile: order.files.length > 0,
          });
    const contextualExtraction = await extractionWithOrderContext({
      store,
      ai,
      orderId: order.id,
      currentExtraction: extraction,
      hasFile: order.files.length > 0,
    });
    order = await store.updatePrintOptions(order.id, {
      copies: contextualExtraction.copies ?? order.printOptions.copies,
      colorMode: contextualExtraction.colorMode ?? order.printOptions.colorMode,
      sideMode: contextualExtraction.sideMode ?? order.printOptions.sideMode,
      paperSize: contextualExtraction.paperSize ?? order.printOptions.paperSize,
      bindingType: contextualExtraction.bindingType ?? order.printOptions.bindingType,
      pagesPerSheet: contextualExtraction.pagesPerSheet ?? order.printOptions.pagesPerSheet,
      fulfillmentType: "pickup",
      pickupTime: contextualExtraction.pickupTime ?? order.printOptions.pickupTime,
      pageCount:
        authoritativePdfPageCount(order) ??
        order.printOptions.pageCount ??
        contextualExtraction.pageCount,
      specialInstructions:
        contextualExtraction.specialInstructions ??
        order.printOptions.specialInstructions,
    });

    const missing = nextMissingField({
      hasFile: order.files.length > 0,
      copies: order.printOptions.copies,
      colorMode: order.printOptions.colorMode,
      sideMode: order.printOptions.sideMode,
      pageCount: order.printOptions.pageCount,
    });

    if (missing) {
      await store.transitionOrder(
        order.id,
        missing === "file" ? "AWAITING_FILE" : "AWAITING_DETAILS",
      );
      await store.markMessageProcessed(inboundMessage.message.id, "completed");
      return twimlMessage(questionForMissingField(missing));
    }

    const quote = calculateQuote({ options: order.printOptions });
    order = await store.setQuote(order.id, quote);
    const reply = confirmationSummary(order);

    await store.createMessage({
      customerId: customer.id,
      orderId: order.id,
      direction: "outbound",
      provider: "demo",
      processingStatus: "completed",
      providerMessageId: null,
      body: reply,
      mediaCount: 0,
      rawPayloadJson: "{}",
    });
    await store.markMessageProcessed(inboundMessage.message.id, "completed");
    return twimlMessage(reply);
  });

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
    return context.html(
      pageShell(
        "Demo payment",
        `<section class="panel narrow"><h1>Razorpay Test Payment</h1><p>${order.publicId}</p><p class="amount">${formatPaise(order.totalPaise)}</p><p>This fallback page appears when Razorpay credentials are not configured. Use the webhook fixture in tests or configure Razorpay Test Mode for a real sandbox link.</p></section>`,
      ),
    );
  });

  app.get("/", (context) => context.redirect("/dashboard/orders"));
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

async function extractionWithOrderContext(input: {
  store: TobiStore;
  ai: AIProvider;
  orderId: string;
  currentExtraction: PrintOrderExtraction;
  hasFile: boolean;
}): Promise<PrintOrderExtraction> {
  const messages = await input.store.listInboundMessagesForOrder(input.orderId);
  const combinedBody = messages
    .map((message) => message.body?.trim())
    .filter((body): body is string => Boolean(body))
    .join("\n");
  if (!combinedBody) return input.currentExtraction;

  const contextual = await input.ai.extractPrintOrder({
    body: combinedBody,
    hasFile: input.hasFile,
  });
  return {
    ...input.currentExtraction,
    copies: contextual.copies ?? input.currentExtraction.copies,
    colorMode: contextual.colorMode ?? input.currentExtraction.colorMode,
    sideMode: contextual.sideMode ?? input.currentExtraction.sideMode,
    paperSize: contextual.paperSize ?? input.currentExtraction.paperSize,
    bindingType: contextual.bindingType ?? input.currentExtraction.bindingType,
    pagesPerSheet:
      contextual.pagesPerSheet ?? input.currentExtraction.pagesPerSheet,
    fulfillmentType:
      contextual.fulfillmentType ?? input.currentExtraction.fulfillmentType,
    pickupTime: contextual.pickupTime ?? input.currentExtraction.pickupTime,
    pageCount: contextual.pageCount ?? input.currentExtraction.pageCount,
    specialInstructions:
      contextual.specialInstructions ?? input.currentExtraction.specialInstructions,
  };
}

function shouldReuseActiveOrder(
  order: Order | null,
  inboundHasPdf: boolean,
): order is Order {
  if (!order) return false;
  if (["QUOTE_READY", "PAYMENT_LINK_SENT", "PAYMENT_PENDING", "PAID", "SHOP_NOTIFIED", "ACCEPTED", "PRINTING", "READY_FOR_PICKUP"].includes(order.status)) {
    return false;
  }
  if (!inboundHasPdf) return true;
  return order.status === "AWAITING_FILE" && order.files.length === 0;
}

async function replyForNonOrderIntent(input: {
  store: TobiStore;
  ai: AIProvider;
  activeOrder: Order | null;
  extraction: PrintOrderExtraction;
  inboundBody: string;
  inboundHasPdf: boolean;
}): Promise<string | null> {
  const { activeOrder, ai, extraction, inboundBody, inboundHasPdf, store } = input;
  if (inboundHasPdf) return null;
  if (["new_print_order", "provide_order_details"].includes(extraction.intent)) return null;
  if (extraction.intent === "ask_quote" && activeOrder) return null;

  if (extraction.intent === "ask_status") {
    if (!activeOrder) return extraction.customerReplyDraft;
    return [
      `Your active order is ${activeOrder.publicId}.`,
      `Order status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`,
      `Payment status: ${activeOrder.paymentStatus.replaceAll("_", " ")}.`,
    ].join("\n");
  }

  if (extraction.intent === "payment_issue") {
    if (!activeOrder) return extraction.customerReplyDraft;
    return [
      `For ${activeOrder.publicId}, payment status is ${activeOrder.paymentStatus.replaceAll("_", " ")}.`,
      activeOrder.paymentLink ? `Payment link: ${activeOrder.paymentLink}` : "I do not have a payment link for this order yet.",
    ].join("\n");
  }

  if (extraction.intent === "cancel_order") {
    if (!activeOrder) return "I do not see an active order to cancel.";
    if (!canTransition(activeOrder.status, "CANCELLED")) {
      return `I cannot cancel ${activeOrder.publicId} from its current status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`;
    }
    const cancelled = await store.transitionOrder(activeOrder.id, "CANCELLED");
    await store.addOrderEvent(cancelled.id, "customer_cancelled_order", {
      channel: "whatsapp",
    });
    return `Cancelled order ${cancelled.publicId}.`;
  }

  if (extraction.intent === "ask_quote") {
    return "I can prepare a quote after I know the PDF and print options. Send the PDF first, then tell me copies, color or black and white, single or double-sided, binding, and pickup time.";
  }

  if (extraction.intent === "other") {
    return ai.generateChatReply({
      body: inboundBody,
      activeOrderSummary: activeOrder ? activeOrderSummary(activeOrder) : null,
    });
  }

  return extraction.customerReplyDraft;
}

function authoritativePdfPageCount(order: Order): number | null {
  return order.files.find((file) => file.pageCount !== null)?.pageCount ?? null;
}

async function handleQuoteConfirmation(input: {
  store: TobiStore;
  env: Env;
  activeOrder: Order | null;
  inboundBody: string;
}): Promise<string | null> {
  const { activeOrder, env, inboundBody, store } = input;
  if (!activeOrder || activeOrder.status !== "QUOTE_READY") return null;

  if (isCancelReply(inboundBody)) {
    const cancelled = await store.transitionOrder(activeOrder.id, "CANCELLED");
    await store.addOrderEvent(cancelled.id, "customer_cancelled_quote", {
      channel: "whatsapp",
    });
    return `Cancelled order ${cancelled.publicId}.`;
  }

  if (!isConfirmReply(inboundBody)) {
    return [
      "Please confirm or cancel this quote before starting another order.",
      confirmationSummary(activeOrder),
    ].join("\n\n");
  }

  const payment = await new RazorpayPaymentService(env).createPaymentRequest(
    activeOrder,
  );
  const order = await store.setPaymentRequest(activeOrder.id, payment);
  return [
    `Confirmed ${order.publicId}.`,
    `Total: ${formatPaise(order.totalPaise)}`,
    `Pay here: ${payment.paymentLink}`,
  ].join("\n");
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

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function loginPage(error?: string): string {
  return pageShell(
    "Login",
    `<div class="login-bg-glow"></div>
    <div class="login-wrapper">
      <header class="login-header">
        <div class="logo">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/><path d="M6 2h12v4H6z"/></svg>
          <span>tobi</span>
        </div>
        <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme" type="button">
          <svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          <svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        </button>
      </header>
      <section class="login-panel">
        <div class="login-header-content">
          <p class="eyebrow">Tobi shop console</p>
          <h1>Enter admin PIN</h1>
        </div>
        ${error ? `<div class="error-badge"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg> <span>${escapeHtml(error)}</span></div>` : ""}
        <form method="post" action="/dashboard/login" class="stack">
          <div class="input-group">
            <label for="pin">PIN</label>
            <div class="input-wrapper">
              <svg class="input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="••••••" autofocus />
            </div>
          </div>
          <button type="submit">Open dashboard</button>
        </form>
      </section>
    </div>`,
  );
}

function ordersPage(orders: Order[]): string {
  const rows = orders
    .map((order) => {
      const orderStatusLower = order.status.toLowerCase();
      const statusLabel = order.status.replaceAll("_", " ");
      const paymentLabel = order.paymentStatus;
      const totalAmount = formatPaise(order.totalPaise);
      const pickupTime = order.printOptions.pickupTime ?? "Anytime";
      const contact = order.customerWhatsappNumber ?? "Unknown";

      return `<tr>
          <td data-label="Order"><a class="order-link" href="/dashboard/orders/${escapeAttribute(order.id)}">${escapeHtml(order.publicId)}</a></td>
          <td data-label="Contact">
            <span class="contact-badge">${escapeHtml(contact)}</span>
          </td>
          <td data-label="Files" class="num-files">
            <div class="files-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              <span>${order.files.length}</span>
            </div>
          </td>
          <td data-label="Status">
            <span class="status-pill status-${escapeAttribute(orderStatusLower)}">
              <span class="status-dot"></span>
              <span>${escapeHtml(statusLabel)}</span>
            </span>
          </td>
          <td data-label="Payment">
            <span class="payment-badge payment-${escapeAttribute(order.paymentStatus.toLowerCase())}">
              ${escapeHtml(paymentLabel)}
            </span>
          </td>
          <td data-label="Total" class="amount-cell">${escapeHtml(totalAmount)}</td>
          <td data-label="Pickup" class="pickup-cell">
            <div class="time-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span>${escapeHtml(pickupTime)}</span>
            </div>
          </td>
          <td class="actions-cell"><a class="button secondary action-btn" href="/dashboard/orders/${escapeAttribute(order.id)}">Open</a></td>
        </tr>`;
    })
    .join("");

  return `<header class="toolbar">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/><path d="M6 2h12v4H6z"/></svg>
          <span>tobi</span>
        </div>
        <div class="divider"></div>
        <h1>Orders</h1>
      </div>
      <div class="toolbar-actions">
        <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme" type="button">
          <svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          <svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        </button>
        <a class="button health-btn" href="/health">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span>Health</span>
        </a>
      </div>
    </header>
    <section class="panel table-panel">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Contact</th>
              <th>Files</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Pickup</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="8" class="empty">No orders yet. Send a WhatsApp fixture to create one.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
}

function orderDetailPage(order: Order): string {
  const statusActions: OrderStatus[] = [
    "ACCEPTED",
    "PRINTING",
    "READY_FOR_PICKUP",
    "COMPLETED",
    "CANCELLED",
  ];
  const validStatusActions = statusActions.filter((status) =>
    canTransition(order.status, status),
  );

  const files = order.files
    .map((file) => {
      const fileIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
      const downloadIcon = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;
      return `<li>
          <div class="file-info-group">
            <span class="file-icon">${fileIcon}</span>
            <div class="file-meta">
              <strong class="file-name">${escapeHtml(file.originalFilename ?? "PDF")}</strong>
              <span class="file-subtext">${escapeHtml(file.pageCount ?? "?")} pages • ${escapeHtml(file.mimeType)}</span>
            </div>
          </div>
          <a class="button secondary download-btn" href="/dashboard/orders/${escapeAttribute(order.id)}/files/${escapeAttribute(file.id)}/download">
            ${downloadIcon}
            <span>Download</span>
          </a>
        </li>`;
    })
    .join("");

  const statusPill = `<span class="status-pill status-${escapeAttribute(order.status.toLowerCase())}">
    <span class="status-dot"></span>
    <span>${escapeHtml(order.status.replaceAll("_", " "))}</span>
  </span>`;

  return `<header class="toolbar">
      <div class="brand">
        <a class="back-link" href="/dashboard/orders" aria-label="Go back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <div class="divider"></div>
        <div>
          <p class="eyebrow">Order detail</p>
          <h1>${escapeHtml(order.publicId)}</h1>
        </div>
      </div>
      <div class="toolbar-actions">
        <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme" type="button">
          <svg class="sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          <svg class="moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
        </button>
        <a class="button secondary back-btn" href="/dashboard/orders">Back</a>
      </div>
    </header>
    <main class="detail-grid">
      <div class="detail-main-column">
        <section class="panel">
          <h2>Print options</h2>
          <dl class="print-options-list">
            <dt>Customer</dt><dd class="mono">${escapeHtml(order.customerWhatsappNumber ?? "Unknown")}</dd>
            <dt>Copies</dt><dd>${escapeHtml(order.printOptions.copies ?? "-")}</dd>
            <dt>Pages</dt><dd class="mono">${escapeHtml(order.printOptions.pageCount ?? "-")}</dd>
            <dt>Color</dt><dd>${escapeHtml(label(order.printOptions.colorMode))}</dd>
            <dt>Sides</dt><dd>${escapeHtml(label(order.printOptions.sideMode))}</dd>
            <dt>Layout</dt><dd>${escapeHtml(order.printOptions.pagesPerSheet)}-up</dd>
            <dt>Paper</dt><dd>${escapeHtml(order.printOptions.paperSize)}</dd>
            <dt>Binding</dt><dd>${escapeHtml(label(order.printOptions.bindingType))}</dd>
            <dt>Pickup</dt><dd>${escapeHtml(order.printOptions.pickupTime ?? "Anytime")}</dd>
          </dl>
        </section>

        <section class="panel">
          <h2>Files</h2>
          <ul class="file-list">${files || `<li class="empty-state"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span>No PDF attached</span></li>`}</ul>
        </section>
      </div>

      <div class="detail-sidebar-column">
        <section class="panel payment-panel">
          <h2>Payment & Status</h2>
          <div class="amount">${escapeHtml(formatPaise(order.totalPaise))}</div>
          <div class="status-wrapper">${statusPill}</div>

          <div class="payment-meta">
            <div class="meta-row">
              <span class="meta-label">Payment Status</span>
              <span class="payment-badge payment-${escapeAttribute(order.paymentStatus.toLowerCase())}">${escapeHtml(order.paymentStatus)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Customer Contact</span>
              <span class="contact-badge">${escapeHtml(order.customerWhatsappNumber ?? "Unknown")}</span>
            </div>
            ${
              order.paymentLink
                ? `
            <div class="meta-row link-row">
              <span class="meta-label">Razorpay Link</span>
              <a class="payment-link-anchor" href="${escapeAttribute(order.paymentLink)}" target="_blank" rel="noopener noreferrer">
                <span>View payment link</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>
              </a>
            </div>`
                : ""
            }
            ${
              order.pickupCode
                ? `
            <div class="pickup-code-box">
              <span class="pickup-label">Pickup Code</span>
              <strong class="pickup-code">${escapeHtml(order.pickupCode)}</strong>
            </div>`
                : ""
            }
          </div>
        </section>

        <section class="panel controls-panel">
          <h2>Status Controls</h2>
          <div class="actions">
            ${
              validStatusActions.length > 0
                ? validStatusActions
                    .map((status) => {
                      let btnClass = "";
                      if (status === "CANCELLED") btnClass = "danger-btn";
                      else if (
                        status === "COMPLETED" ||
                        status === "READY_FOR_PICKUP"
                      )
                        btnClass = "success-btn";
                      return `<form method="post" action="/dashboard/orders/${escapeAttribute(order.id)}/status">
                          <input type="hidden" name="status" value="${escapeAttribute(status)}" />
                          <button type="submit" class="${btnClass}">${escapeHtml(status.replaceAll("_", " "))}</button>
                        </form>`;
                    })
                    .join("")
                : `<p class="muted">No status actions are available for this state.</p>`
            }
          </div>
        </section>
      </div>
    </main>`;
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)} · Tobi</title>
      <meta name="color-scheme" content="light dark" />
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>${dashboardCss}</style>
      <script>
        (function() {
          const theme = localStorage.getItem("theme");
          if (theme) {
            document.documentElement.setAttribute("data-theme", theme);
          }
        })();
      </script>
    </head>
    <body>
      ${body}
      <script>
        document.addEventListener("DOMContentLoaded", () => {
          const toggle = document.getElementById("theme-toggle");
          if (toggle) {
            toggle.addEventListener("click", () => {
              const current = document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
              const next = current === "dark" ? "light" : "dark";
              document.documentElement.setAttribute("data-theme", next);
              localStorage.setItem("theme", next);
            });
          }
        });
      </script>
    </body>
  </html>`;
}

const dashboardCss = `
  :root {
    color-scheme: light dark;

    /* Theme-specific definitions (default to light values) */
    --accent-light: oklch(58% 0.23 268);
    --accent-dark: oklch(72% 0.17 268);
    --accent: light-dark(var(--accent-light), var(--accent-dark));

    --accent-hover-light: oklch(50% 0.23 268);
    --accent-hover-dark: oklch(78% 0.15 268);
    --accent-hover: light-dark(var(--accent-hover-light), var(--accent-hover-dark));

    --accent-subtle-light: oklch(96% 0.015 268);
    --accent-subtle-dark: oklch(22% 0.04 268);
    --accent-subtle: light-dark(var(--accent-subtle-light), var(--accent-subtle-dark));

    --bg-light: oklch(98% 0.005 250);
    --bg-dark: oklch(12% 0.015 250);
    --bg: light-dark(var(--bg-light), var(--bg-dark));

    --panel-light: oklch(100% 0 0);
    --panel-dark: oklch(18% 0.02 250);
    --panel: light-dark(var(--panel-light), var(--panel-dark));

    --text-light: oklch(24% 0.015 250);
    --text-dark: oklch(93% 0.01 250);
    --text: light-dark(var(--text-light), var(--text-dark));

    --text-muted-light: oklch(52% 0.015 250);
    --text-muted-dark: oklch(72% 0.01 250);
    --text-muted: light-dark(var(--text-muted-light), var(--text-muted-dark));

    --line-light: oklch(92% 0.01 250);
    --line-dark: oklch(24% 0.02 250);
    --line: light-dark(var(--line-light), var(--line-dark));

    --amber-bg: light-dark(oklch(96% 0.04 80), oklch(24% 0.05 80));
    --amber-text: light-dark(oklch(48% 0.12 80), oklch(84% 0.10 80));

    --green-bg: light-dark(oklch(95% 0.05 140), oklch(22% 0.06 140));
    --green-text: light-dark(oklch(42% 0.12 140), oklch(82% 0.11 140));

    --blue-bg: light-dark(oklch(95% 0.05 240), oklch(24% 0.06 240));
    --blue-text: light-dark(oklch(45% 0.14 240), oklch(82% 0.11 240));

    --red-bg: light-dark(oklch(95% 0.05 20), oklch(24% 0.06 20));
    --red-text: light-dark(oklch(45% 0.14 20), oklch(82% 0.11 20));

    --shadow-light: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.04);
    --shadow-dark: 0 1px 3px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.18);
    --shadow: light-dark(var(--shadow-light), var(--shadow-dark));

    --scrollbar-track: light-dark(oklch(96% 0 0), oklch(16% 0 0));
    --scrollbar-thumb: light-dark(oklch(82% 0 0), oklch(32% 0 0));

    accent-color: var(--accent);
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --accent: var(--accent-dark);
      --accent-hover: var(--accent-hover-dark);
      --accent-subtle: var(--accent-subtle-dark);
      --bg: var(--bg-dark);
      --panel: var(--panel-dark);
      --text: var(--text-dark);
      --text-muted: var(--text-muted-dark);
      --line: var(--line-dark);
      --shadow: var(--shadow-dark);
    }
  }

  :root[data-theme="light"] {
    color-scheme: light;
    --accent: var(--accent-light);
    --accent-hover: var(--accent-hover-light);
    --accent-subtle: var(--accent-subtle-light);
    --bg: var(--bg-light);
    --panel: var(--panel-light);
    --text: var(--text-light);
    --text-muted: var(--text-muted-light);
    --line: var(--line-light);
    --shadow: var(--shadow-light);
  }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --accent: var(--accent-dark);
    --accent-hover: var(--accent-hover-dark);
    --accent-subtle: var(--accent-subtle-dark);
    --bg: var(--bg-dark);
    --panel: var(--panel-dark);
    --text: var(--text-dark);
    --text-muted: var(--text-muted-dark);
    --line: var(--line-dark);
    --shadow: var(--shadow-dark);
  }

  * { box-sizing: border-box; outline-color: var(--accent); }

  body {
    margin: 0;
    min-height: 100vh;
    background-color: var(--bg);
    color: var(--text);
    font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
    padding: 32px 24px;
    line-height: 1.5;
    transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3, p { margin: 0; }
  h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; text-wrap: balance; }
  h2 { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }

  a { color: var(--accent); text-decoration: none; font-weight: 600; transition: color 0.2s ease; }
  a:hover { color: var(--accent-hover); }

  .eyebrow { color: var(--text-muted); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin: 0 auto 32px;
    max-width: 1120px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brand h1 { font-size: 24px; font-weight: 800; }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand .divider {
    width: 1px;
    height: 24px;
    background-color: var(--line);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.03em;
    color: var(--text);
  }
  .logo svg {
    color: var(--accent);
  }

  .panel {
    background-color: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 24px;
    max-width: 1120px;
    margin: 0 auto;
    transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .table-panel {
    padding: 0;
    overflow: hidden;
  }

  .table-container {
    overflow-x: auto;
    scrollbar-width: thin;
  }

  /* Forms & Buttons */
  .stack { display: grid; gap: 20px; margin-top: 24px; }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .input-group label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-wrapper input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px 12px 40px;
    font: inherit;
    background-color: var(--bg);
    color: var(--text);
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .input-wrapper input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
    outline: none;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    color: var(--text-muted);
    pointer-events: none;
  }

  button, .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
    border: 0;
    border-radius: 8px;
    background-color: var(--accent);
    color: #ffffff;
    padding: 10px 18px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s ease, transform 0.1s ease, box-shadow 0.2s;
  }

  button:hover, .button:hover {
    background-color: var(--accent-hover);
  }

  button:active, .button:active {
    transform: scale(0.98);
  }

  button:focus-visible, .button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .button.secondary {
    background-color: var(--accent-subtle);
    color: var(--accent);
  }
  .button.secondary:hover {
    background-color: light-dark(oklch(91% 0.03 268), oklch(28% 0.08 268));
  }

  /* Table styling */
  table { width: 100%; border-collapse: collapse; font-size: 14px; text-align: left; }
  th, td { padding: 16px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  th {
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: light-dark(oklch(97% 0.005 250), oklch(15% 0.02 250));
  }

  tbody tr {
    transition: background-color 0.15s ease;
  }
  tbody tr:hover {
    background-color: light-dark(oklch(99% 0 0), oklch(21% 0.01 250));
  }
  tbody tr:last-child td { border-bottom: none; }

  .order-link {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 14px;
  }

  .files-badge, .time-badge, .contact-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .contact-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text);
    background-color: var(--bg);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
    white-space: nowrap;
  }
  .files-badge svg, .time-badge svg {
    color: var(--text-muted);
    opacity: 0.8;
  }

  .amount-cell, .pickup-cell, .mono {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
  }
  .amount-cell {
    font-size: 14px;
  }

  .empty { color: var(--text-muted); text-align: center; padding: 48px; font-weight: 500; }

  /* Login page spec */
  .login-bg-glow {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 30%, light-dark(oklch(94% 0.05 268 / 50%), oklch(15% 0.08 268 / 25%)), transparent 50%),
                radial-gradient(circle at 80% 70%, light-dark(oklch(96% 0.03 140 / 40%), oklch(14% 0.06 140 / 20%)), transparent 55%);
    z-index: -1;
    pointer-events: none;
  }

  .login-wrapper {
    max-width: 440px;
    margin: 8vh auto 0;
    position: relative;
  }

  .login-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 0 4px;
  }

  .login-panel {
    background: light-dark(rgba(255, 255, 255, 0.7), rgba(24, 25, 28, 0.7));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.08));
    border-radius: 16px;
    padding: 32px;
    box-shadow: var(--shadow);
  }

  .login-header-content {
    margin-bottom: 24px;
  }

  .error-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--red-bg);
    color: var(--red-text);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
    border: 1px solid light-dark(oklch(90% 0.05 20), oklch(35% 0.06 20));
  }

  /* Theme Toggle Button */
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    min-height: auto;
    border-radius: 50%;
    background-color: var(--panel);
    color: var(--text-muted);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    transition: color 0.2s, background-color 0.2s, border-color 0.2s;
  }
  .theme-toggle:hover {
    color: var(--text);
    background-color: var(--bg);
  }
  .theme-toggle svg {
    transition: transform 0.3s ease;
  }
  .theme-toggle:active svg {
    transform: rotate(15deg) scale(0.9);
  }

  .theme-toggle .sun { display: none; }
  .theme-toggle .moon { display: block; }

  :root[data-theme="dark"] .theme-toggle .sun { display: block; }
  :root[data-theme="dark"] .theme-toggle .moon { display: none; }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle .sun { display: block; }
    :root:not([data-theme="light"]) .theme-toggle .moon { display: none; }
  }

  /* Detail Layout styling */
  .detail-grid {
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
    gap: 24px;
  }

  .detail-main-column, .detail-sidebar-column {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .detail-grid .panel { width: 100%; margin: 0; }

  /* Definition list styling */
  .print-options-list {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 16px 20px;
    margin: 0;
  }
  .print-options-list dt {
    color: var(--text-muted);
    font-weight: 700;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
  }
  .print-options-list dd {
    margin: 0;
    font-weight: 700;
    color: var(--text);
    font-size: 15px;
  }

  .amount {
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--text);
    line-height: 1.1;
  }

  .status-wrapper {
    margin: 12px 0 24px;
  }

  .payment-meta {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--line);
    padding-top: 20px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .meta-label {
    color: var(--text-muted);
    font-weight: 600;
  }

  .payment-link-anchor {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }

  .pickup-code-box {
    background-color: var(--accent-subtle);
    border: 1px dashed var(--accent);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
  }
  .pickup-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pickup-code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 20px;
    font-weight: 800;
    color: var(--accent);
    letter-spacing: 0.05em;
  }

  /* File items */
  .file-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .file-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px 16px;
    background-color: light-dark(oklch(99.5% 0 0), oklch(20% 0.01 250));
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .file-list li:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }

  .file-info-group {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background-color: var(--bg);
    color: var(--accent);
    flex-shrink: 0;
  }
  .file-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .file-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-subtext {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px !important;
    border: 1px dashed var(--line) !important;
    background: transparent !important;
    color: var(--text-muted);
  }
  .empty-state svg {
    opacity: 0.5;
  }

  /* Status Controls Actions */
  .actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
  .actions form { margin: 0; width: 100%; }
  .actions button {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
    background-color: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
  }
  .actions button:hover {
    background-color: var(--panel);
    border-color: var(--accent);
    color: var(--accent);
  }

  .actions button.success-btn {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: transparent;
  }
  .actions button.success-btn:hover {
    background-color: light-dark(oklch(91% 0.06 140), oklch(30% 0.08 140));
    color: var(--green-text);
  }

  .actions button.danger-btn {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: transparent;
  }
  .actions button.danger-btn:hover {
    background-color: light-dark(oklch(91% 0.06 20), oklch(30% 0.08 20));
    color: var(--red-text);
  }

  /* Focus and scrollbars */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: light-dark(oklch(70% 0 0), oklch(40% 0 0));
  }

  /* Status Pills */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 9999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid transparent;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .status-payment_link_sent, .status-payment_pending, .status-quote_ready, .status-awaiting_file, .status-awaiting_details {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: light-dark(oklch(90% 0.05 80), oklch(35% 0.06 80));
  }
  .status-payment_link_sent .status-dot, .status-payment_pending .status-dot, .status-quote_ready .status-dot, .status-awaiting_file .status-dot, .status-awaiting_details .status-dot {
    background-color: var(--amber-text);
  }

  .status-paid, .status-shop_notified, .status-ready_for_pickup, .status-completed {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: light-dark(oklch(88% 0.06 140), oklch(33% 0.08 140));
  }
  .status-paid .status-dot, .status-shop_notified .status-dot, .status-ready_for_pickup .status-dot, .status-completed .status-dot {
    background-color: var(--green-text);
  }

  .status-printing, .status-accepted {
    background-color: var(--blue-bg);
    color: var(--blue-text);
    border-color: light-dark(oklch(88% 0.06 240), oklch(33% 0.08 240));
  }
  .status-printing .status-dot, .status-accepted .status-dot {
    background-color: var(--blue-text);
  }

  .status-cancelled, .status-failed {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: light-dark(oklch(88% 0.06 20), oklch(33% 0.08 20));
  }
  .status-cancelled .status-dot, .status-failed .status-dot {
    background-color: var(--red-text);
  }

  /* Payment status badges (compact, text-only pills) */
  .payment-badge {
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: var(--bg);
    border: 1px solid var(--line);
  }
  .payment-captured, .payment-succeeded, .payment-paid {
    background-color: var(--green-bg);
    color: var(--green-text);
    border-color: transparent;
  }
  .payment-pending {
    background-color: var(--amber-bg);
    color: var(--amber-text);
    border-color: transparent;
  }
  .payment-failed {
    background-color: var(--red-bg);
    color: var(--red-text);
    border-color: transparent;
  }

  @media (max-width: 840px) {
    body { padding: 24px 16px; }
    .toolbar { flex-direction: column; align-items: stretch; gap: 16px; margin-bottom: 24px; }
    .brand { justify-content: space-between; }
    .toolbar-actions { gap: 10px; justify-content: flex-end; }
    .detail-grid { grid-template-columns: 1fr; gap: 20px; }
    table { font-size: 13px; }
    th, td { padding: 12px 14px; }
    .print-options-list { grid-template-columns: 110px 1fr; gap: 12px 16px; }
    .actions { grid-template-columns: repeat(2, 1fr); }
  }

  @media (max-width: 580px) {
    .brand h1 { font-size: 20px; }
    .logo { font-size: 16px; }
    .brand .divider { height: 18px; }
    table, thead, tbody, tr, th, td { display: block; }
    thead { display: none; }
    tr { border-bottom: 1px solid var(--line); padding: 14px 6px; position: relative; }
    td { border: 0; padding: 6px 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    td::before {
      content: attr(data-label);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    td.actions-cell::before { content: none; }
    td.actions-cell { justify-content: flex-end; margin-top: 8px; }
    .file-list li { flex-direction: column; align-items: stretch; gap: 12px; }
    .download-btn { width: 100%; }
    .actions { grid-template-columns: 1fr; }
  }
`;
