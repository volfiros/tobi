import type { Order, OrderStatus } from "./domain";
import { formatPaise } from "./services/pricing";
import { canTransition } from "./services/stateMachine";
import { label } from "./utils/labels";

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

export function loginPage(error?: string): string {
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

export function ordersPage(orders: Order[]): string {
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

export function orderDetailPage(order: Order): string {
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

export function demoPaymentPage(order: Order): string {
  return pageShell(
    "Demo payment",
    `<section class="panel narrow"><h1>Razorpay Test Payment</h1><p>${escapeHtml(order.publicId)}</p><p class="amount">${escapeHtml(formatPaise(order.totalPaise))}</p><p>This fallback page appears when Razorpay credentials are not configured. Use the webhook fixture in tests or configure Razorpay Test Mode for a real sandbox link.</p></section>`,
  );
}

export function pageShell(title: string, body: string): string {
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
      <link rel="stylesheet" href="/dashboard/styles.css">
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
