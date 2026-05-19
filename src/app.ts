import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Order, OrderStatus, PrintOptions } from "./domain";
import { calculateQuote, formatPaise } from "./services/pricing";
import { createAIProvider } from "./services/extraction";
import { RazorpayPaymentService } from "./services/razorpay";
import { canTransition, nextMissingField, questionForMissingField } from "./services/stateMachine";
import { parseInboundWhatsApp, twimlMessage, verifyTwilioSignature } from "./services/whatsapp";
import { createStore, type TobiStore } from "./store";

type AppVariables = {
  store: TobiStore;
};

export function createApp(store?: TobiStore): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  app.use("*", async (context, next) => {
    context.set("store", store ?? createStore(context.env));
    await next();
  });

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "tobi",
      environment: context.env.APP_ENV ?? "test"
    })
  );

  app.get("/demo/sample.pdf", () =>
    new Response("%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF", {
      headers: { "content-type": "application/pdf" }
    })
  );

  app.post("/webhooks/whatsapp", async (context) => {
    if (context.env.TWILIO_AUTH_TOKEN) {
      const verified = await verifyTwilioSignature(context.req.raw, context.env.TWILIO_AUTH_TOKEN, context.env.PUBLIC_APP_URL);
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
      rawPayloadJson: JSON.stringify(inbound.raw)
    });
    if (inboundMessage.duplicate) return twimlMessage("Already received this message.");
    const customer = await store.upsertCustomer({ whatsappNumber: inbound.from });
    let order = (await store.findActiveOrder(customer.id)) ?? (await store.createOrder({ customerId: customer.id, shopId: context.env.DEMO_SHOP_ID ?? "shop_demo" }));
    await store.attachMessageToOrder(inboundMessage.message.id, order.id);

    try {
      for (const [index, media] of inbound.media.entries()) {
        if (!media.contentType.includes("pdf")) continue;
        const stored = await storeInboundPdf(context.env, media.url, `orders/${order.id}/upload-${index + 1}.pdf`, media.contentType);
        await store.addOrderFile({
          orderId: order.id,
          originalFilename: media.filename ?? `upload-${index + 1}.pdf`,
          mimeType: media.contentType,
          r2Key: stored.r2Key,
          pageCount: media.pageCount ?? stored.pageCount,
          fileSizeBytes: media.sizeBytes ?? stored.fileSizeBytes
        });
      }
    } catch (error) {
      await store.markMessageProcessed(inboundMessage.message.id, "failed");
      throw error;
    }

    order = (await store.getOrder(order.id)) ?? order;
    const ai = createAIProvider(context.env);
    const extraction = await ai.extractPrintOrder({ body: inbound.body, hasFile: order.files.length > 0 });
    order = await store.updatePrintOptions(order.id, {
      copies: extraction.copies ?? order.printOptions.copies,
      colorMode: extraction.colorMode ?? order.printOptions.colorMode,
      sideMode: extraction.sideMode ?? order.printOptions.sideMode,
      paperSize: extraction.paperSize ?? order.printOptions.paperSize,
      bindingType: extraction.bindingType ?? order.printOptions.bindingType,
      fulfillmentType: "pickup",
      pickupTime: extraction.pickupTime ?? order.printOptions.pickupTime,
      pageCount: extraction.pageCount ?? order.printOptions.pageCount,
      specialInstructions: extraction.specialInstructions ?? order.printOptions.specialInstructions
    });

    const missing = nextMissingField({
      hasFile: order.files.length > 0,
      copies: order.printOptions.copies,
      colorMode: order.printOptions.colorMode,
      sideMode: order.printOptions.sideMode,
      pageCount: order.printOptions.pageCount
    });

    if (missing) {
      await store.transitionOrder(order.id, missing === "file" ? "AWAITING_FILE" : "AWAITING_DETAILS");
      await store.markMessageProcessed(inboundMessage.message.id, "completed");
      return twimlMessage(questionForMissingField(missing));
    }

    const quote = calculateQuote({ options: order.printOptions });
    order = await store.setQuote(order.id, quote);
    const payment = await new RazorpayPaymentService(context.env).createPaymentRequest(order);
    order = await store.setPaymentRequest(order.id, payment);
    const reply = [
      `Quote for ${order.publicId}`,
      `${quote.pages} pages x ${quote.copies} copies, ${label(order.printOptions.colorMode)}, ${label(order.printOptions.sideMode)}, ${order.printOptions.paperSize}`,
      `Binding: ${label(order.printOptions.bindingType)}`,
      `Total: ${formatPaise(quote.totalPaise)}`,
      `Pay here: ${payment.paymentLink}`
    ].join("\n");

    await store.createMessage({
      customerId: customer.id,
      orderId: order.id,
      direction: "outbound",
      provider: "demo",
      processingStatus: "completed",
      providerMessageId: null,
      body: reply,
      mediaCount: 0,
      rawPayloadJson: "{}"
    });
    await store.markMessageProcessed(inboundMessage.message.id, "completed");
    return twimlMessage(reply);
  });

  app.post("/webhooks/razorpay", async (context) => {
    const store = context.get("store");
    const paymentService = new RazorpayPaymentService(context.env);
    const event = await paymentService.verifyWebhook(context.req.raw);
    const result = await store.applyPaymentEvent(event);
    await store.addOrderEvent(result.order.id, result.duplicate ? "payment_webhook_duplicate" : "payment_webhook_applied", event);
    if (!result.duplicate && result.order.status === "PAID") {
      const notificationClaim = await store.claimShopNotification(result.order.id);
      if (notificationClaim.claimed) {
        await createShopNotification(store, notificationClaim.order);
        await createCustomerPaymentConfirmation(store, notificationClaim.order);
      }
    }
    return context.json({ ok: true, duplicate: result.duplicate });
  });

  app.get("/orders/:publicId", async (context) => {
    const order = await context.get("store").getOrderByPublicId(context.req.param("publicId"));
    if (!order) return context.notFound();
    return context.json(publicOrder(order));
  });

  app.get("/demo/pay/:publicId", async (context) => {
    const order = await context.get("store").getOrderByPublicId(context.req.param("publicId"));
    if (!order) return context.notFound();
    return context.html(pageShell("Demo payment", `<section class="panel narrow"><h1>Razorpay Test Payment</h1><p>${order.publicId}</p><p class="amount">${formatPaise(order.totalPaise)}</p><p>This fallback page appears when Razorpay credentials are not configured. Use the webhook fixture in tests or configure Razorpay Test Mode for a real sandbox link.</p></section>`));
  });

  app.get("/", (context) => context.redirect("/dashboard/orders"));
  app.get("/dashboard/login", (context) => context.html(loginPage()));
  app.post("/dashboard/login", async (context) => {
    const form = await context.req.formData();
    const pin = String(form.get("pin") ?? "");
    if (pin !== (context.env.ADMIN_PIN ?? "123456")) {
      return context.html(loginPage("Invalid PIN"), 401);
    }
    setCookie(context, "tobi_admin", context.env.ADMIN_SESSION_TOKEN ?? "dev-session", {
      httpOnly: true,
      sameSite: "Lax",
      path: "/dashboard",
      secure: context.env.APP_ENV === "production"
    });
    return context.redirect("/dashboard/orders");
  });

  app.use("/dashboard/*", async (context, next) => {
    if (context.req.path === "/dashboard/login") return next();
    const token = getCookie(context, "tobi_admin");
    if (token !== (context.env.ADMIN_SESSION_TOKEN ?? "dev-session")) return context.redirect("/dashboard/login");
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
    const order = await context.get("store").transitionOrder(context.req.param("id"), status);
    await context.get("store").addOrderEvent(order.id, "shop_status_update", { status });
    return context.redirect(`/dashboard/orders/${order.id}`);
  });

  app.get("/dashboard/orders/:id/files/:fileId/download", async (context) => {
    const order = await context.get("store").getOrder(context.req.param("id"));
    if (!order) return context.notFound();
    const file = order.files.find((candidate) => candidate.id === context.req.param("fileId"));
    if (!file) return context.notFound();
    const object = await context.env.FILES.get(file.r2Key);
    if (!object) return context.notFound();
    return new Response(object.body, {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": `attachment; filename="${file.originalFilename ?? "document.pdf"}"`,
        "cache-control": "private, max-age=60"
      }
    });
  });

  return app;
}

async function createShopNotification(store: TobiStore, order: Order): Promise<void> {
  const body = [
    `New paid print order: ${order.publicId}`,
    `Amount paid: ${formatPaise(order.totalPaise)}`,
    `Files: ${order.files.length}`,
    `Print: ${label(order.printOptions.colorMode)}, ${label(order.printOptions.sideMode)}, ${order.printOptions.paperSize}`,
    `Pickup: ${order.printOptions.pickupTime ?? "Anytime"}`
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
    rawPayloadJson: JSON.stringify({ notification: "shop_paid_order" })
  });
  await store.addOrderEvent(order.id, "shop_notified", { channel: "demo", body });
}

async function createCustomerPaymentConfirmation(store: TobiStore, order: Order): Promise<void> {
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
    rawPayloadJson: JSON.stringify({ notification: "customer_payment_confirmed" })
  });
  await store.addOrderEvent(order.id, "customer_payment_confirmed", { channel: "demo", body });
}

function publicOrder(order: Order): Record<string, unknown> {
  return {
    publicId: order.publicId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalPaise: order.totalPaise,
    pickupCode: order.pickupCode
  };
}

async function storeInboundPdf(
  env: Env,
  mediaUrl: string,
  r2Key: string,
  contentType: string
): Promise<{ r2Key: string; fileSizeBytes: number | null; pageCount: number | null }> {
  if (!env.FILES) throw new Error("R2 FILES binding is required for PDF intake");
  let response: Response;
  try {
    response = await fetch(mediaUrl, {
      headers: twilioMediaHeaders(env)
    });
  } catch (error) {
    throw new Error(`Unable to fetch inbound PDF media: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`Unable to fetch inbound PDF media: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await env.FILES.put(r2Key, bytes, {
      httpMetadata: { contentType }
  });
  return {
    r2Key,
    fileSizeBytes: bytes.byteLength,
    pageCount: countPdfPages(bytes)
  };
}

function twilioMediaHeaders(env: Env): HeadersInit {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return {};
  return {
    Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`
  };
}

function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length || null;
}

function label(value: string | null): string {
  return (value ?? "not set").replaceAll("_", " ");
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
    `<section class="login-panel">
      <div>
        <p class="eyebrow">Tobi shop console</p>
        <h1>Enter admin PIN</h1>
      </div>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form method="post" action="/dashboard/login" class="stack">
        <label>PIN <input name="pin" type="password" inputmode="numeric" autocomplete="current-password" autofocus /></label>
        <button type="submit">Open dashboard</button>
      </form>
    </section>`
  );
}

function ordersPage(orders: Order[]): string {
  const rows = orders
    .map(
      (order) => `<tr>
        <td><a href="/dashboard/orders/${escapeAttribute(order.id)}">${escapeHtml(order.publicId)}</a></td>
        <td>${order.files.length}</td>
        <td><span class="status ${escapeAttribute(order.status.toLowerCase())}">${escapeHtml(order.status.replaceAll("_", " "))}</span></td>
        <td>${escapeHtml(order.paymentStatus)}</td>
        <td>${escapeHtml(formatPaise(order.totalPaise))}</td>
        <td>${escapeHtml(order.printOptions.pickupTime ?? "Anytime")}</td>
        <td><a class="button secondary" href="/dashboard/orders/${escapeAttribute(order.id)}">Open</a></td>
      </tr>`
    )
    .join("");
  return `<header class="toolbar"><div><p class="eyebrow">Tobi</p><h1>Orders</h1></div><a class="button" href="/health">Health</a></header>
    <section class="panel">
      <table>
        <thead><tr><th>Order</th><th>Files</th><th>Status</th><th>Payment</th><th>Total</th><th>Pickup</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No orders yet. Send a WhatsApp fixture to create one.</td></tr>`}</tbody>
      </table>
    </section>`;
}

function orderDetailPage(order: Order): string {
  const statusActions: OrderStatus[] = ["ACCEPTED", "PRINTING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"];
  const validStatusActions = statusActions.filter((status) => canTransition(order.status, status));
  const files = order.files
    .map(
      (file) =>
        `<li><strong>${escapeHtml(file.originalFilename ?? "PDF")}</strong><span>${escapeHtml(file.pageCount ?? "?")} pages</span><span>${escapeHtml(file.mimeType)}</span><a class="button secondary" href="/dashboard/orders/${escapeAttribute(order.id)}/files/${escapeAttribute(file.id)}/download">Download</a></li>`
    )
    .join("");
  return `<header class="toolbar"><div><p class="eyebrow">Order detail</p><h1>${escapeHtml(order.publicId)}</h1></div><a class="button secondary" href="/dashboard/orders">Back</a></header>
    <main class="detail-grid">
      <section class="panel">
        <h2>Print options</h2>
        <dl>
          <dt>Copies</dt><dd>${escapeHtml(order.printOptions.copies ?? "-")}</dd>
          <dt>Pages</dt><dd>${escapeHtml(order.printOptions.pageCount ?? "-")}</dd>
          <dt>Color</dt><dd>${escapeHtml(label(order.printOptions.colorMode))}</dd>
          <dt>Sides</dt><dd>${escapeHtml(label(order.printOptions.sideMode))}</dd>
          <dt>Paper</dt><dd>${escapeHtml(order.printOptions.paperSize)}</dd>
          <dt>Binding</dt><dd>${escapeHtml(label(order.printOptions.bindingType))}</dd>
          <dt>Pickup</dt><dd>${escapeHtml(order.printOptions.pickupTime ?? "Anytime")}</dd>
        </dl>
      </section>
      <section class="panel">
        <h2>Payment</h2>
        <p class="amount">${escapeHtml(formatPaise(order.totalPaise))}</p>
        <p><span class="status ${escapeAttribute(order.status.toLowerCase())}">${escapeHtml(order.status.replaceAll("_", " "))}</span></p>
        ${order.paymentLink ? `<p><a href="${escapeAttribute(order.paymentLink)}">Payment link</a></p>` : ""}
        ${order.pickupCode ? `<p class="pickup">Pickup code: <strong>${escapeHtml(order.pickupCode)}</strong></p>` : ""}
      </section>
      <section class="panel">
        <h2>Files</h2>
        <ul class="file-list">${files || "<li>No PDF attached</li>"}</ul>
      </section>
      <section class="panel">
        <h2>Status controls</h2>
        <div class="actions">
          ${
            validStatusActions.length > 0
              ? validStatusActions
                  .map(
                    (status) => `<form method="post" action="/dashboard/orders/${escapeAttribute(order.id)}/status"><input type="hidden" name="status" value="${escapeAttribute(status)}" /><button type="submit">${escapeHtml(status.replaceAll("_", " "))}</button></form>`
                  )
                  .join("")
              : `<p class="muted">No status actions are available for this state.</p>`
          }
        </div>
      </section>
    </main>`;
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)} · Tobi</title>
      <style>${dashboardCss}</style>
    </head>
    <body>${body}</body>
  </html>`;
}

const dashboardCss = `
  :root { color-scheme: light; --bg: #f6f7f7; --panel: #ffffff; --text: #17211f; --muted: #66736f; --line: #d9dfdd; --primary: #0f766e; --amber: #b45309; --blue: #2563eb; --red: #b91c1c; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 28px; line-height: 1.15; letter-spacing: 0; }
  h2 { font-size: 16px; margin-bottom: 16px; }
  a { color: var(--primary); font-weight: 700; }
  .eyebrow { color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 auto 20px; max-width: 1120px; }
  .panel, .login-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
  .panel { padding: 18px; max-width: 1120px; margin: 0 auto; }
  .narrow, .login-panel { max-width: 420px; margin: 12vh auto 0; padding: 24px; }
  .stack { display: grid; gap: 14px; margin-top: 20px; }
  label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
  input { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 11px 12px; font: inherit; }
  button, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border: 0; border-radius: 6px; background: var(--primary); color: white; padding: 8px 12px; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; white-space: nowrap; }
  .secondary { background: #e6eeee; color: #0f3f3b; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 12px 10px; vertical-align: middle; }
  th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
  .empty { color: var(--muted); text-align: center; padding: 28px; }
  .status { display: inline-flex; border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 900; background: #e6eeee; color: #123b37; text-transform: capitalize; }
  .payment_link_sent, .payment_pending, .quote_ready { background: #fef3c7; color: var(--amber); }
  .paid, .shop_notified, .ready_for_pickup, .completed { background: #dcfce7; color: #166534; }
  .printing, .accepted { background: #dbeafe; color: var(--blue); }
  .cancelled, .failed { background: #fee2e2; color: var(--red); }
  .detail-grid { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(280px, .85fr); gap: 16px; }
  .detail-grid .panel { width: 100%; margin: 0; }
  dl { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; margin: 0; }
  dt { color: var(--muted); font-weight: 700; }
  dd { margin: 0; font-weight: 800; overflow-wrap: anywhere; }
  .amount { font-size: 30px; font-weight: 900; margin-bottom: 12px; }
  .pickup { margin-top: 14px; }
  .file-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .file-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .actions form { margin: 0; }
  .error { color: var(--red); margin-top: 14px; font-weight: 800; }
  .muted { color: var(--muted); }
  @media (max-width: 760px) {
    body { padding: 14px; }
    .toolbar { align-items: flex-start; }
    .detail-grid { grid-template-columns: 1fr; }
    table, thead, tbody, tr, th, td { display: block; }
    thead { display: none; }
    tr { border-bottom: 1px solid var(--line); padding: 10px 0; }
    td { border: 0; padding: 7px 0; }
    .file-list li { grid-template-columns: 1fr; }
    .actions button { width: 100%; }
    .actions form { flex: 1 1 160px; }
  }
`;
