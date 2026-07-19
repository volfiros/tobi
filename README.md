<p align="center">
  <img src="./assets/tobi-logo-luminal.svg" alt="Tobi animated printer logo" width="780">
</p>

Tobi is a WhatsApp-first print-ordering demo for Indian print shops. Customers send a PDF and print instructions in WhatsApp, Tobi uses a hybrid AI understanding layer to interpret the message, asks for missing details, prepares a deterministic quote, sends a Razorpay Test Mode payment link, and updates a shop dashboard when payment is confirmed.

The app is built as a Hono app on Cloudflare Workers with Cloudflare D1, R2, KV, WhatsApp Cloud API webhooks, GPT-5.4 mini message understanding through CodeGate, and Razorpay Test Mode webhooks. Twilio sandbox parsing remains only as a legacy fallback for form-encoded smoke tests.

## Demo Video

https://github.com/user-attachments/assets/06b11db9-f4dc-41f5-aea3-562f63291ea4

[Open the demo video site](https://volfiros.github.io/tobi/demo/)

## Product Flow

1. A customer messages the WhatsApp Cloud API business number.
2. Tobi receives the inbound webhook at `/webhooks/whatsapp`.
3. PDF files are stored in R2 and the PDF page count is treated as authoritative.
4. Clear messages follow deterministic rules. When a real AI request is needed, WhatsApp shows a typing indicator while Tobi waits for CodeGate.
5. GPT-5.4 mini returns structured message understanding: intent, confidence, normalized print slots, ambiguity, and optional general-chat reply.
6. Backend code validates the understanding and performs all order, file, quote, payment, and state changes.
7. Tobi asks for missing information one field at a time.
8. Tobi shows a confirmation summary with pages, copies, layout, sides, pickup time, billable sheets, and total price.
9. Before payment starts, customers can change details such as "make it color instead" and Tobi recomputes the quote.
10. The customer taps `Confirm` or `Cancel` when WhatsApp interactive buttons are available, or sends the same words as text.
11. On confirmation, Tobi creates a Razorpay Test Mode payment link.
12. Razorpay posts payment events to `/webhooks/razorpay`.
13. Paid orders appear in the dashboard for shop processing.
14. The shop updates order status from the dashboard.

## Deployed App

Current Worker URL:

```text
https://tobi.rithvik-padma.workers.dev
```

Production WhatsApp test chat:

[Chat with Tobi on WhatsApp](https://wa.me/918074009337?text=Hi%20Tobi%2C%20I%20want%20to%20print%20a%20PDF)

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
WhatsApp Cloud API
  -> WhatsApp webhook
  -> Hono Worker
  -> GPT-5.4 mini message understanding through CodeGate
  -> deterministic backend workflow
  -> D1 orders/messages/payments
  -> R2 PDF storage
  -> Razorpay payment link
  -> Razorpay webhook
  -> D1 payment/order update
  -> Dashboard
```

The AI boundary is intentionally narrow: GPT-5.4 mini interprets print-domain WhatsApp messages, while backend code validates and executes the workflow. Pricing, payment links, PDF storage, PDF page counts, missing-field prompts, and order state transitions are deterministic. Clear instructions are handled by rules first; AI results are cached in KV and provider failures fall back to the deterministic interpretation. The WhatsApp typing indicator is sent only when an actual AI provider request starts, not for rules-only or cached responses.

Examples:

- `two copies` updates the active order copy count when a PDF/order is already in progress.
- `make it color instead` updates a pre-payment quote and returns a refreshed confirmation summary.
- `how much now?` returns a quote when enough details are present, or asks for the next missing detail.
- `what kind of files do you support?` gets an immediate rules-based answer that Tobi currently accepts PDF documents.
- `matte or glossy for a text-heavy report?` gets a short, direct recommendation from the AI instead of a generic capability statement.

Core storage:

- **D1**: customers, orders, messages, payments, webhook events, order events, pricing rules.
- **R2**: uploaded PDF files.
- **KV**: AI understanding cache and dashboard/session support.
- **Worker secrets**: Meta WhatsApp, Razorpay, CodeGate/OpenAI, dashboard credentials, and optional Twilio fallback credentials.

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

Required for the complete WhatsApp Cloud API, GPT-5.4 mini, Razorpay, and dashboard workflow:

```text
APP_ENV
PUBLIC_APP_URL
DEFAULT_CURRENCY
DEMO_SHOP_ID
DEMO_SHOP_NAME
ADMIN_PIN
ADMIN_SESSION_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_GRAPH_API_VERSION
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
OPENAI_API_KEY
OPENAI_BASE_URL
OPENAI_DEFAULT_MODEL
```

Optional for the legacy Twilio sandbox fallback:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
```

For local testing without external services, tests use mocks and fixtures. For real WhatsApp and payment testing, WhatsApp Cloud API, Razorpay, and CodeGate values are needed. Twilio values are optional and only support the legacy sandbox/form-encoded path.

Run the opt-in live AI validation only when `OPENAI_API_KEY` is available in `.dev.vars`:

```bash
bun run test:ai:live
```

This makes 90 uncached GPT-5.4 mini requests and enforces structured-output, intent/slot accuracy, critical-flow accuracy, and a five-second p95 latency gate. It is intentionally excluded from `bun test` and CI.

## Manual Service Setup

### WhatsApp Cloud API

Set the WhatsApp callback URL to:

```text
https://<worker-url>/webhooks/whatsapp
```

Use this verify token:

```text
WHATSAPP_VERIFY_TOKEN
```

Subscribe the webhook to WhatsApp message events. Inbound JSON webhooks are handled as WhatsApp Cloud API messages, and outbound replies are sent through the Graph API using:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_GRAPH_API_VERSION
```

Set `WHATSAPP_APP_SECRET` to verify `x-hub-signature-256` webhook signatures.

### Legacy Twilio WhatsApp Sandbox

Twilio sandbox support is kept in `src/services/twilio.ts` for fallback smoke tests and older demos. If you use it, set the inbound WhatsApp webhook to:

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
bunx wrangler secret put WHATSAPP_ACCESS_TOKEN
bunx wrangler secret put WHATSAPP_APP_SECRET
bunx wrangler secret put WHATSAPP_VERIFY_TOKEN
bunx wrangler secret put RAZORPAY_KEY_ID
bunx wrangler secret put RAZORPAY_KEY_SECRET
bunx wrangler secret put RAZORPAY_WEBHOOK_SECRET
bunx wrangler secret put OPENAI_API_KEY
```

Optional legacy Twilio fallback secrets:

```bash
bunx wrangler secret put TWILIO_ACCOUNT_SID
bunx wrangler secret put TWILIO_AUTH_TOKEN
bunx wrangler secret put TWILIO_WHATSAPP_FROM
```

## Pricing Behavior

Pricing is deterministic and handled in `src/services/pricing.ts`.

Important rules:

- PDF page count is authoritative.
- N-up layout changes billable sheets, not the original PDF page count.
- Double-sided printing reduces billable sheets after layout is applied.
- Staple binding is the free default when the customer does not mention binding.
- Generic binding requests, such as "I want binding", are treated as spiral binding.
- Spiral binding is charged per copy.
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
- AI-only WhatsApp typing indicators and non-blocking indicator failures.
- General conversation replies.
- Hybrid AI message understanding.
- Adaptive print-domain follow-up messages.
- Order state transitions.
- PDF page-count handling.
- N-up layout extraction.
- Quote calculation.
- Duplicate inbound message handling.
- WhatsApp Cloud API webhook handling and outbound Graph API replies.
- Legacy Twilio signature verification.
- Razorpay webhook idempotency.
- Dashboard rendering.

## UX Improvement Backlog

Recommended next improvements based on the current customer and shop flows:

- Show the active order state in every customer reply once an order exists, especially while waiting for file/details/payment.
- Prefer WhatsApp interactive buttons for quote confirmation, cancellation, and payment-help choices, with text fallbacks for unsupported clients.
- Add dashboard filters for paid, ready-for-pickup, and stuck orders so shop staff can scan the queue faster.
- Add a clearer payment-progress message after sending the Razorpay link, including what the customer should do if payment succeeds but the order does not update.
- Surface file metadata in customer replies after PDF upload, including filename and page count, before asking for missing print options.

## Demo Limitations

- This is a demo, not a production payment or fulfillment system.
- Payments use Razorpay Test Mode.
- WhatsApp is currently integrated through the WhatsApp Cloud API. Twilio sandbox support is retained only as a fallback test path.
- The dashboard is PIN-protected, not a full multi-user auth system.
- V1 is optimized for one demo shop and pickup-only orders.
- Human review is still recommended before printing real customer documents.

## Project Structure

```text
src/
  app.ts                 Hono route wiring, WhatsApp flow, dashboard HTML
  domain.ts              Zod schemas and domain types
  index.ts               Worker entrypoint
  store.ts               D1 and in-memory stores
  db/migrations/         D1 migrations
  services/              WhatsApp, extraction, pricing, payments, PDF intake, notifications
  utils/                 Shared formatting and ID helpers
tests/                   Vitest coverage
assets/                  Product and README assets
wrangler.toml            Cloudflare Worker bindings and deploy config
```

## Project Documentation

- [Original implementation plan](references/tobi_chatbot_implementation_plan.md)
- [Cloudflare local setup](docs/setup/cloudflare-local.md)
- [Dashboard design direction](design/README.md)
- [Demo page design specification](design/demo-page-DESIGN.md)

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
- Keep Meta webhook verify token and app secret in sync with the Worker secrets.
- Keep Twilio webhook URL and `PUBLIC_APP_URL` in sync only when using the legacy sandbox fallback.
- Use Test Mode credentials for demos.
