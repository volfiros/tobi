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

const ICONS = {
  printer:
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/><path d="M6 2h12v4H6z"/></svg>',
  sun: '<svg class="sun" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg class="moon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  pulse:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  lock: '<svg class="input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  stack:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>',
  rupee:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a6 5 0 0 0 6-5"/></svg>',
  inbox:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>',
} as const;

function logoMark(): string {
  return `<span class="logo-mark">${ICONS.printer}</span>`;
}

function themeToggle(): string {
  return `<button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme" type="button">
        <span class="icon-swap">${ICONS.sun}${ICONS.moon}</span>
      </button>`;
}

function statusPillHtml(status: OrderStatus): string {
  return `<span class="status-pill status-${escapeAttribute(status.toLowerCase())}">
      <span class="status-dot"></span>
      <span>${escapeHtml(status.replaceAll("_", " "))}</span>
    </span>`;
}

function reveal(index: number): string {
  return `reveal" style="--reveal-index:${index}`;
}

const TRACK_STEPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "received", label: "Received" },
  { key: "payment", label: "Payment" },
  { key: "printing", label: "Printing" },
  { key: "pickup", label: "Pickup" },
  { key: "done", label: "Done" },
];

const TRACK_INDEX: Record<OrderStatus, number> = {
  DRAFT: 0,
  AWAITING_FILE: 0,
  AWAITING_DETAILS: 0,
  QUOTE_READY: 1,
  PAYMENT_LINK_SENT: 1,
  PAYMENT_PENDING: 1,
  PAID: 2,
  SHOP_NOTIFIED: 2,
  ACCEPTED: 2,
  PRINTING: 2,
  READY_FOR_PICKUP: 3,
  COMPLETED: 4,
  CANCELLED: -1,
  FAILED: -2,
};

const TRACK_LIVE: ReadonlySet<OrderStatus> = new Set([
  "PAYMENT_PENDING",
  "PRINTING",
  "ACCEPTED",
]);

function statusTrackHtml(order: Order): string {
  const index = TRACK_INDEX[order.status];
  const isCancelled = order.status === "CANCELLED";
  const isFailed = order.status === "FAILED";
  const isDone = order.status === "COMPLETED";
  const isLive = TRACK_LIVE.has(order.status);

  const steps = TRACK_STEPS.map((step, i) => {
    const classes = ["track-step"];
    let glyph = "";
    if (isCancelled) {
      if (i < index) classes.push("done");
      if (i === index) {
        classes.push("current", "terminal-cancel");
        glyph = ICONS.x;
      }
    } else if (isFailed) {
      if (i < index) classes.push("done");
      if (i === index) {
        classes.push("current", "terminal-fail");
        glyph = ICONS.alert;
      }
    } else if (i < index || isDone) {
      classes.push("done");
      glyph = ICONS.check;
    } else if (i === index) {
      classes.push("current");
      if (isLive) classes.push("is-live");
    }

    return `<div class="${classes.join(" ")}">
          <span class="track-node">${glyph}</span>
          <span class="track-label">${step.label}</span>
        </div>`;
  });

  const withConnectors: string[] = [];
  steps.forEach((stepHtml, i) => {
    withConnectors.push(stepHtml);
    if (i < steps.length - 1) {
      const filled =
        !isCancelled && !isFailed && (isDone ? true : i < index);
      withConnectors.push(
        `<span class="track-connector${filled ? " done" : ""}"></span>`,
      );
    }
  });

  let note = "";
  if (isCancelled) {
    note = `<p class="track-note is-cancel">${ICONS.x}<span>This order was cancelled.</span></p>`;
  } else if (isFailed) {
    note = `<p class="track-note is-fail">${ICONS.alert}<span>Payment needs attention — resend the link or cancel.</span></p>`;
  } else if (isDone) {
    note = `<p class="track-note">${ICONS.check}<span>Order completed${
      order.pickupCode ? ` · pickup code ${escapeHtml(order.pickupCode)}` : ""
    }.</span></p>`;
  }

  return `<div class="status-track" role="img" aria-label="Order progress: ${escapeAttribute(
    order.status.replaceAll("_", " "),
  )}">
      ${withConnectors.join("")}
    </div>
    ${note}`;
}

function ordersStatsHtml(orders: Order[]): string {
  const activeStatuses: ReadonlySet<OrderStatus> = new Set([
    "DRAFT",
    "AWAITING_FILE",
    "AWAITING_DETAILS",
    "QUOTE_READY",
    "PAYMENT_LINK_SENT",
    "PAYMENT_PENDING",
    "PAID",
    "SHOP_NOTIFIED",
    "ACCEPTED",
    "PRINTING",
    "READY_FOR_PICKUP",
  ]);
  const awaitingStatuses: ReadonlySet<OrderStatus> = new Set([
    "DRAFT",
    "AWAITING_FILE",
    "AWAITING_DETAILS",
    "QUOTE_READY",
    "PAYMENT_LINK_SENT",
    "PAYMENT_PENDING",
  ]);

  const active = orders.filter((order) => activeStatuses.has(order.status)).length;
  const awaiting = orders.filter((order) => awaitingStatuses.has(order.status)).length;
  const ready = orders.filter((order) => order.status === "READY_FOR_PICKUP").length;
  const revenuePaise = orders
    .filter((order) => order.paymentStatus === "succeeded")
    .reduce((sum, order) => sum + order.totalPaise, 0);

  const cards = [
    {
      icon: ICONS.inbox,
      label: "Active orders",
      value: `<span data-count="${active}">${active}</span>`,
      sub: `of ${orders.length} total`,
    },
    {
      icon: ICONS.clock,
      label: "Awaiting action",
      value: `<span data-count="${awaiting}">${awaiting}</span>`,
      sub: "quotes & payments",
    },
    {
      icon: ICONS.check,
      label: "Ready for pickup",
      value: `<span data-count="${ready}">${ready}</span>`,
      sub: "waiting on customers",
    },
    {
      icon: ICONS.rupee,
      label: "Collected",
      value: `<span class="mono" data-count="${revenuePaise}" data-format="paise">${escapeHtml(
        formatPaise(revenuePaise),
      )}</span>`,
      sub: "paid orders",
    },
  ];

  return `<section class="stats-strip" aria-label="Order summary">
      ${cards
        .map(
          (card, i) => `<article class="stat-card ${reveal(i)}">
          <span class="stat-label">${card.icon}<span>${card.label}</span></span>
          <span class="stat-value">${card.value}</span>
          <span class="stat-sub">${card.sub}</span>
        </article>`,
        )
        .join("")}
    </section>`;
}

export function loginPage(error?: string): string {
  return pageShell(
    "Login",
    `<div class="login-bg-glow"></div>
    <div class="login-wrapper">
      <header class="login-header">
        <div class="logo">
          ${logoMark()}
          <span>tobi</span>
        </div>
        ${themeToggle()}
      </header>
      <section class="login-panel reveal" style="--reveal-index:1">
        <div class="login-header-content">
          <p class="eyebrow">Tobi shop console</p>
          <h1>Enter admin PIN</h1>
        </div>
        ${
          error
            ? `<div class="error-badge" role="alert">${ICONS.alert}<span>${escapeHtml(error)}</span></div>`
            : ""
        }
        <form method="post" action="/dashboard/login" class="stack">
          <div class="input-group">
            <label for="pin">PIN</label>
            <div class="input-wrapper">
              ${ICONS.lock}
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
              ${ICONS.file}
              <span>${order.files.length}</span>
            </div>
          </td>
          <td data-label="Status">
            ${statusPillHtml(order.status)}
          </td>
          <td data-label="Payment">
            <span class="payment-badge payment-${escapeAttribute(order.paymentStatus.toLowerCase())}">
              ${escapeHtml(paymentLabel)}
            </span>
          </td>
          <td data-label="Total" class="amount-cell">${escapeHtml(totalAmount)}</td>
          <td data-label="Pickup" class="pickup-cell">
            <div class="time-badge">
              ${ICONS.clock}
              <span>${escapeHtml(pickupTime)}</span>
            </div>
          </td>
          <td class="actions-cell"><a class="button secondary action-btn" href="/dashboard/orders/${escapeAttribute(order.id)}">Open</a></td>
        </tr>`;
    })
    .join("");

  const sortedOrders = [...orders].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return `<header class="toolbar">
      <div class="brand">
        <div class="logo">
          ${logoMark()}
          <span>tobi</span>
        </div>
        <div class="divider"></div>
        <div class="title-block">
          <p class="eyebrow">Shop console</p>
          <h1>Orders</h1>
        </div>
      </div>
      <div class="toolbar-actions">
        ${themeToggle()}
        <a class="button health-btn" href="/health">
          ${ICONS.pulse}
          <span>Health</span>
        </a>
      </div>
    </header>
    ${ordersStatsHtml(sortedOrders)}
    <section class="panel table-panel ${reveal(4)}">
      <div class="orders-meta">
        <span><span class="mono" data-count="${orders.length}">${orders.length}</span> ${orders.length === 1 ? "order" : "orders"}</span>
        <span>Newest first</span>
      </div>
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

const STATUS_ACTIONS: OrderStatus[] = [
  "ACCEPTED",
  "PRINTING",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
];

const PRIMARY_STATUS_ACTION: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: "ACCEPTED",
  SHOP_NOTIFIED: "ACCEPTED",
  ACCEPTED: "PRINTING",
  PRINTING: "READY_FOR_PICKUP",
  READY_FOR_PICKUP: "COMPLETED",
};

const STATUS_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "Accept order",
  PRINTING: "Start printing",
  READY_FOR_PICKUP: "Mark ready for pickup",
  COMPLETED: "Confirm pickup",
  CANCELLED: "Cancel order",
};

const STATUS_ACTION_GUIDANCE: Record<OrderStatus, string> = {
  DRAFT: "This order is still being prepared. No shop action is needed yet.",
  AWAITING_FILE: "This order is waiting for the customer's PDF.",
  AWAITING_DETAILS: "This order is waiting for print details from the customer.",
  QUOTE_READY: "The quote is waiting for customer confirmation.",
  PAYMENT_LINK_SENT: "The payment link has been sent. No shop action is needed yet.",
  PAYMENT_PENDING: "Payment is being processed. No shop action is needed yet.",
  PAID: "Review the print details before accepting this order.",
  SHOP_NOTIFIED: "Review the print details before accepting this order.",
  ACCEPTED: "Start the job when the printer is running.",
  PRINTING: "Finish printing, then notify the customer that it is ready.",
  READY_FOR_PICKUP: "Confirm after the customer collects the order.",
  COMPLETED: "This order is complete. No further action is needed.",
  CANCELLED: "This order was cancelled. No further action is available.",
  FAILED: "Payment needs attention before this order can move forward.",
};

function readableStatus(status: OrderStatus): string {
  const value = status.replaceAll("_", " ").toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusActionForm(
  orderId: string,
  status: OrderStatus,
  className: string,
): string {
  return `<form method="post" action="/dashboard/orders/${escapeAttribute(orderId)}/status">
      <input type="hidden" name="status" value="${escapeAttribute(status)}" />
      <button type="submit" class="${className}">${escapeHtml(
        STATUS_ACTION_LABELS[status] ?? readableStatus(status),
      )}</button>
    </form>`;
}

function statusControlsHtml(order: Order): string {
  const validActions = STATUS_ACTIONS.filter((status) =>
    canTransition(order.status, status),
  );
  const primaryStatus = PRIMARY_STATUS_ACTION[order.status];
  const primaryAction =
    primaryStatus && validActions.includes(primaryStatus)
      ? primaryStatus
      : null;
  const otherActions = validActions.filter(
    (status) => status !== primaryAction && status !== "CANCELLED",
  );
  const canCancel = validActions.includes("CANCELLED");

  return `<section class="panel controls-panel ${reveal(3)}" aria-labelledby="status-actions-title">
      <p class="status-control-kicker">Current status · ${escapeHtml(readableStatus(order.status))}</p>
      <h2 id="status-actions-title">Next step</h2>
      <p class="status-control-guidance" aria-live="polite">${escapeHtml(
        STATUS_ACTION_GUIDANCE[order.status],
      )}</p>
      ${
        primaryAction
          ? statusActionForm(
              order.id,
              primaryAction,
              "status-primary-action",
            )
          : ""
      }
      ${
        otherActions.length > 0
          ? `<details class="status-more-actions">
              <summary>
                <span>More actions</span>
                <span class="status-more-icon" aria-hidden="true">+</span>
              </summary>
              <div class="status-more-actions-list">
                ${otherActions
                  .map((status) =>
                    statusActionForm(
                      order.id,
                      status,
                      "status-secondary-action",
                    ),
                  )
                  .join("")}
              </div>
            </details>`
          : ""
      }
      ${
        canCancel
          ? `<div class="status-danger-zone">
              <button id="cancel-order-trigger" class="status-cancel-trigger" type="button">Cancel order</button>
            </div>
            <dialog id="cancel-order-dialog" class="status-confirm-dialog" aria-labelledby="cancel-order-title" aria-describedby="cancel-order-description">
              <div class="status-dialog-icon">${ICONS.alert}</div>
              <h2 id="cancel-order-title">Cancel this order?</h2>
              <p id="cancel-order-description">The order will stop here. This can’t be undone.</p>
              <div class="status-dialog-actions">
                <form method="dialog">
                  <button id="keep-order-button" class="status-dialog-keep" type="submit" autofocus>Keep order</button>
                </form>
                ${statusActionForm(
                  order.id,
                  "CANCELLED",
                  "status-dialog-cancel",
                )}
              </div>
            </dialog>`
          : ""
      }
    </section>`;
}

function timestampHtml(value: string): string {
  const parsed = new Date(value);
  const fallback = Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(parsed);

  return `<time datetime="${escapeAttribute(value)}" data-local-time>${escapeHtml(fallback)}</time>`;
}

function timingItemHtml(
  labelText: string,
  value: string,
  description: string,
  icon: string,
): string {
  return `<li class="timing-item">
      <span class="timing-icon">${icon}</span>
      <div class="timing-copy">
        <span class="timing-label">${escapeHtml(labelText)}</span>
        <strong>${timestampHtml(value)}</strong>
        <span class="timing-description">${escapeHtml(description)}</span>
      </div>
      <span class="timing-relative" data-relative-time="${escapeAttribute(value)}"></span>
    </li>`;
}

function orderTimingHtml(order: Order): string {
  const latestFile = [...order.files].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];

  return `<section class="panel timing-panel ${reveal(2)}" aria-labelledby="order-timing-title">
      <div class="timing-heading">
        <div>
          <p class="timing-kicker">Activity</p>
          <h2 id="order-timing-title">Order timing</h2>
        </div>
        <span class="timing-heading-icon">${ICONS.clock}</span>
      </div>
      <ul class="timing-list">
        ${timingItemHtml(
          "Created",
          order.createdAt,
          "Order received by Tobi",
          ICONS.inbox,
        )}
        ${timingItemHtml(
          "Last activity",
          order.updatedAt,
          "Most recent order change",
          ICONS.pulse,
        )}
        ${
          latestFile
            ? timingItemHtml(
                "Latest file",
                latestFile.createdAt,
                latestFile.originalFilename ?? "PDF received",
                ICONS.file,
              )
            : `<li class="timing-item timing-item-empty">
                <span class="timing-icon">${ICONS.file}</span>
                <div class="timing-copy">
                  <span class="timing-label">Latest file</span>
                  <strong>Not received yet</strong>
                  <span class="timing-description">Waiting for a PDF upload</span>
                </div>
              </li>`
        }
      </ul>
      <p class="timing-timezone">Times shown in your local timezone</p>
    </section>`;
}

export function orderDetailPage(order: Order): string {
  const files = order.files
    .map((file) => {
      const fileIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`;
      return `<li>
          <div class="file-info-group">
            <span class="file-icon">${fileIcon}</span>
            <div class="file-meta">
              <strong class="file-name">${escapeHtml(file.originalFilename ?? "PDF")}</strong>
              <span class="file-subtext">${escapeHtml(file.pageCount ?? "?")} pages • ${escapeHtml(file.mimeType)}</span>
            </div>
          </div>
          <a class="button secondary download-btn" href="/dashboard/orders/${escapeAttribute(order.id)}/files/${escapeAttribute(file.id)}/download">
            ${ICONS.download}
            <span>Download</span>
          </a>
        </li>`;
    })
    .join("");

  return `<header class="toolbar">
      <div class="brand">
        <a class="back-link" href="/dashboard/orders" aria-label="Back to orders">
          ${ICONS.back}
        </a>
        <div class="divider"></div>
        <div class="title-block">
          <p class="eyebrow">Order detail</p>
          <h1>${escapeHtml(order.publicId)}</h1>
        </div>
      </div>
      <div class="toolbar-actions">
        ${themeToggle()}
        <a class="button secondary back-btn" href="/dashboard/orders">All orders</a>
      </div>
    </header>
    <main class="detail-grid">
      <div class="detail-main-column">
        <section class="panel ${reveal(0)}">
          <h2>Progress</h2>
          ${statusTrackHtml(order)}
        </section>

        <section class="panel ${reveal(1)}">
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

        <section class="panel ${reveal(2)}">
          <h2>Files</h2>
          <ul class="file-list">${files || `<li class="empty-state"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><span>No PDF attached</span></li>`}</ul>
        </section>
      </div>

      <div class="detail-sidebar-column">
        <section class="panel payment-panel ${reveal(1)}">
          <h2>Payment & Status</h2>
          <div class="amount">${escapeHtml(formatPaise(order.totalPaise))}</div>
          <div class="status-wrapper">${statusPillHtml(order.status)}</div>

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
                ${ICONS.external}
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

        ${orderTimingHtml(order)}

        ${statusControlsHtml(order)}
      </div>
    </main>`;
}

export function demoPaymentPage(order: Order): string {
  return pageShell(
    "Demo payment",
    `<div class="login-wrapper">
      <section class="panel login-panel reveal" style="--reveal-index:0">
        <div class="login-header-content">
          <p class="eyebrow">Razorpay sandbox</p>
          <h1>Test payment</h1>
        </div>
        <p class="mono">${escapeHtml(order.publicId)}</p>
        <p class="amount" style="margin-top:10px">${escapeHtml(formatPaise(order.totalPaise))}</p>
        <p class="muted" style="margin-top:14px">This fallback page appears when Razorpay credentials are not configured. Use the webhook fixture in tests or configure Razorpay Test Mode for a real sandbox link.</p>
      </section>
    </div>`,
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
      <link rel="stylesheet" href="/dashboard/styles.css">
      <script>
        (function() {
          try {
            var theme = localStorage.getItem("theme");
            if (theme) {
              document.documentElement.setAttribute("data-theme", theme);
            }
          } catch (err) {}
        })();
      </script>
    </head>
    <body>
      ${body}
      <script>
        (function () {
          var root = document.documentElement;
          var toggle = document.getElementById("theme-toggle");
          if (toggle) {
            toggle.addEventListener("click", function () {
              var current =
                root.getAttribute("data-theme") ||
                (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
              var next = current === "dark" ? "light" : "dark";
              root.setAttribute("data-theme", next);
              try {
                localStorage.setItem("theme", next);
              } catch (err) {}
            });
          }

          var toolbar = document.querySelector(".toolbar");
          if (toolbar && "IntersectionObserver" in window) {
            var sentinel = document.createElement("div");
            sentinel.style.height = "1px";
            toolbar.parentElement.insertBefore(sentinel, toolbar);
            new IntersectionObserver(function (entries) {
              toolbar.classList.toggle("scrolled", !entries[0].isIntersecting);
            }).observe(sentinel);
          }

          var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!reduceMotion) {
            document.querySelectorAll("[data-count]").forEach(function (el) {
              var target = Number(el.getAttribute("data-count") || "0");
              var format = el.getAttribute("data-format");
              var formatValue = function (value) {
                if (format === "paise") {
                  var rupees = value / 100;
                  var decimals = value % 100 === 0 ? 0 : 2;
                  return "\\u20B9" + rupees.toFixed(decimals);
                }
                return String(value);
              };
              var duration = 750;
              var start = null;
              var step = function (timestamp) {
                if (start === null) start = timestamp;
                var progress = Math.min((timestamp - start) / duration, 1);
                var eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = formatValue(Math.round(target * eased));
                if (progress < 1) requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            });
          }

          var cancelTrigger = document.getElementById("cancel-order-trigger");
          var cancelDialog = document.getElementById("cancel-order-dialog");
          var keepOrderButton = document.getElementById("keep-order-button");
          if (cancelTrigger && cancelDialog && typeof cancelDialog.showModal === "function") {
            cancelTrigger.addEventListener("click", function () {
              cancelDialog.showModal();
              if (keepOrderButton) keepOrderButton.focus();
            });
            cancelDialog.addEventListener("close", function () {
              cancelTrigger.focus();
            });
            cancelDialog.addEventListener("click", function (event) {
              if (event.target === cancelDialog) cancelDialog.close();
            });
          }

          var absoluteFormatter = new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
          });
          var relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
            numeric: "auto"
          });
          var relativeUnits = [
            ["year", 31536000000],
            ["month", 2592000000],
            ["week", 604800000],
            ["day", 86400000],
            ["hour", 3600000],
            ["minute", 60000]
          ];
          document.querySelectorAll("[data-local-time]").forEach(function (element) {
            var date = new Date(element.getAttribute("datetime"));
            if (!Number.isNaN(date.getTime())) {
              element.textContent = absoluteFormatter.format(date);
              element.title = date.toISOString();
            }
          });
          document.querySelectorAll("[data-relative-time]").forEach(function (element) {
            var date = new Date(element.getAttribute("data-relative-time"));
            if (Number.isNaN(date.getTime())) return;
            var difference = date.getTime() - Date.now();
            var unit = relativeUnits.find(function (entry) {
              return Math.abs(difference) >= entry[1];
            }) || ["minute", 60000];
            element.textContent = relativeFormatter.format(
              Math.round(difference / unit[1]),
              unit[0]
            );
          });
        })();
      </script>
    </body>
  </html>`;
}
