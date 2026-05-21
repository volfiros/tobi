<p align="center">
  <img src="./assets/tobi-logo.svg" alt="Tobi animated printer logo" width="780">
</p>

Tobi is a WhatsApp-first print-ordering demo for Indian print shops. Customers send a PDF and print instructions in WhatsApp, Tobi extracts the print options, asks for missing details, prepares a deterministic quote, sends a Razorpay Test Mode payment link, and updates a shop dashboard when payment is confirmed.

The app is built as a Hono app on Cloudflare Workers with Cloudflare D1, R2, KV, Twilio WhatsApp Sandbox, Gemini extraction, and Razorpay Test Mode webhooks.

## Product Flow

1. A customer messages the Twilio WhatsApp Sandbox.
2. Tobi receives the inbound webhook at `/webhooks/whatsapp`.
3. PDF files are stored in R2 and the PDF page count is treated as authoritative.
4. Gemini plus deterministic fallback rules extract print options such as copies, color mode, side mode, binding, pickup time, and N-up layout.
5. Tobi asks for missing information one field at a time.
6. Tobi shows a confirmation summary with pages, copies, layout, sides, pickup time, billable sheets, and total price.
7. The customer replies `Confirm` or `Cancel`.
8. On confirmation, Tobi creates a Razorpay Test Mode payment link.
9. Razorpay posts payment events to `/webhooks/razorpay`.
10. Paid orders appear in the dashboard for shop processing.
11. The shop updates order status from the dashboard.

## Deployed App

Current Worker URL:

```text
https://tobi.rithvik-padma.workers.dev
```

Important routes:

```text
GET  /health
POST /webhooks/whatsapp
POST /webhooks/razorpay
GET  /dashboard/login
GET  /dashboard/orders
GET  /dashboard/orders/:id
POST /dashboard/orders/:id/status
```

The dashboard is deployed in the same Worker as the webhooks. It reads from the same remote D1 database that WhatsApp intake and Razorpay payment confirmation write to.

## Dashboard

The dashboard is a shop console for reviewing and processing orders. It includes:

- Order list with customer WhatsApp contact.
- Payment status and order status.
- File count and PDF download.
- Print options: page count, copies, color, sides, layout, paper, binding, pickup time.
- Quote snapshot and total amount.
- Status controls for shop workflow.

Login is protected by `ADMIN_PIN` and an HTTP-only dashboard session cookie.

## Architecture

```text
WhatsApp Sandbox
  -> Twilio webhook
  -> Hono Worker
  -> D1 orders/messages/payments
  -> R2 PDF storage
  -> Gemini extraction
  -> Razorpay payment link
  -> Razorpay webhook
  -> D1 payment/order update
  -> Dashboard
```

Core storage:

- **D1**: customers, orders, messages, payments, webhook events, order events, pricing rules.
- **R2**: uploaded PDF files.
- **KV**: dashboard/session support.
- **Worker secrets**: Twilio, Razorpay, Gemini, and dashboard credentials.

## Local Development

Install dependencies:

```bash
bun install
```

Create local environment variables:

```bash
cp .dev.vars.example .dev.vars
```

Fill `.dev.vars` with local/demo credentials. Do not commit `.dev.vars`.

Apply local D1 migrations:

```bash
bunx wrangler d1 migrations apply tobi-demo-db --local
```

Start the local Worker:

```bash
bun run dev
```

Open:

```text
http://localhost:8787/dashboard/login
```

## Environment Variables

Required for the complete workflow:

```text
APP_ENV
PUBLIC_APP_URL
DEFAULT_CURRENCY
DEMO_SHOP_ID
DEMO_SHOP_NAME
ADMIN_PIN
ADMIN_SESSION_TOKEN
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
GEMINI_API_KEY
GEMINI_DEFAULT_MODEL
```

For local testing without external services, some tests use mocks and fixtures. For real WhatsApp and payment testing, Twilio, Razorpay, and Gemini values are needed.

## Manual Service Setup

### Twilio WhatsApp Sandbox

Set the inbound WhatsApp webhook to:

```text
https://<worker-url>/webhooks/whatsapp
```

Use method:

```text
POST
```

The public URL must match `PUBLIC_APP_URL` because Twilio signature verification depends on the exact webhook URL.

### Razorpay Test Mode

Use Razorpay Test Mode keys for:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
```

Create a webhook for:

```text
https://<worker-url>/webhooks/razorpay
```

Set the webhook secret to the same value as:

```text
RAZORPAY_WEBHOOK_SECRET
```

Enable these events:

```text
payment.captured
payment_link.paid
payment_link.expired
payment_link.cancelled
```

### Cloudflare

The Worker needs configured bindings for:

- D1 database: `DB`
- R2 bucket: `FILES`
- KV namespace: `SESSIONS`
- Queue producer: `JOB_QUEUE`

Secrets should be uploaded with Wrangler:

```bash
bunx wrangler secret put ADMIN_PIN
bunx wrangler secret put ADMIN_SESSION_TOKEN
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_WHATSAPP_FROM
bunx wrangler secret put RAZORPAY_KEY_ID
bunx wrangler secret put RAZORPAY_KEY_SECRET
bunx wrangler secret put RAZORPAY_WEBHOOK_SECRET
bunx wrangler secret put GEMINI_API_KEY
```

## Pricing Behavior

Pricing is deterministic and handled in `src/services/pricing.ts`.

Important rules:

- PDF page count is authoritative.
- N-up layout changes billable sheets, not the original PDF page count.
- Double-sided printing reduces billable sheets after layout is applied.
- Binding is charged per copy.
- A small demo platform fee is added.

Example: a 5-page PDF, 2 copies, black and white, double-sided, spiral binding:

```text
Printing: 6 billable sheets
Binding: spiral x 2 copies
Platform fee: demo fee
```

## Testing

Run the test suite:

```bash
bun test
```

Run the typecheck:

```bash
bun run lint
```

Run the combined verification command:

```bash
bun run verify
```

The tests cover:

- WhatsApp message handling.
- General conversation replies.
- Order state transitions.
- PDF page-count handling.
- N-up layout extraction.
- Quote calculation.
- Duplicate inbound message handling.
- Twilio signature verification.
- Razorpay webhook idempotency.
- Dashboard rendering.

## Demo Limitations

- This is a demo, not a production payment or fulfillment system.
- Payments use Razorpay Test Mode.
- WhatsApp is currently tested through Twilio Sandbox.
- The dashboard is PIN-protected, not a full multi-user auth system.
- V1 is optimized for one demo shop and pickup-only orders.
- Human review is still recommended before printing real customer documents.

## Project Structure

```text
src/
  app.ts                 Hono routes, WhatsApp flow, dashboard HTML
  domain.ts              Zod schemas and domain types
  index.ts               Worker entrypoint
  store.ts               D1 and in-memory stores
  db/migrations/         D1 migrations
  services/              Extraction, pricing, payments, storage helpers
tests/                   Vitest coverage
assets/                  Product and README assets
wrangler.toml            Cloudflare Worker bindings and deploy config
```

## Common Commands

```bash
bun install
bun run dev
bun test
bun run lint
bun run verify
bunx wrangler deploy
```

## Security Notes

- Never commit `.dev.vars`, `.env`, API keys, webhook secrets, or dashboard secrets.
- Keep Razorpay webhook secret and Worker secret in sync.
- Keep Twilio webhook URL and `PUBLIC_APP_URL` in sync.
- Use Test Mode credentials for demos.
