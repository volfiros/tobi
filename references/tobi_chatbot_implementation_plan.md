# Tobi WhatsApp Print Assistant — Implementation Plan

**Project:** Tobi  
**Product type:** WhatsApp-native print-ordering chatbot  
**Primary AI provider:** Gemini  
**Language:** TypeScript  
**Runtime / infrastructure:** Cloudflare Workers  
**WhatsApp provider:** Twilio WhatsApp Business Platform  
**Primary use case:** Customers send printable files on WhatsApp, choose print options, pay, and track pickup/delivery. Print shops receive structured paid orders through a dashboard and WhatsApp alerts.

---

## 1. Product Summary

Tobi is a WhatsApp chatbot for local print shops, campus print centers, cyber cafés, coaching-center print counters, and office-area document shops.

A customer sends a PDF, image, or document to Tobi on WhatsApp and says something like:

> Print this, 2 copies, black and white, spiral binding, pickup at 5.

Tobi should:

1. Receive the message and file through Twilio WhatsApp.
2. Store the file securely.
3. Extract or ask for print preferences.
4. Count pages where possible.
5. Calculate a quote using deterministic backend rules.
6. Generate a payment request or payment link.
7. Confirm payment through webhook.
8. Create a paid order for the print shop.
9. Send the shop a WhatsApp alert and dashboard link.
10. Send the customer order updates until completion.

The important product principle:

> The AI understands natural language and extracts intent. The backend handles pricing, payments, order state, and fulfillment.

---

## 2. Core Differentiator

Tobi is not just a chatbot. It is a transaction and fulfillment workflow.

The product should complete this loop:

```text
Customer intent
  -> structured print order
  -> quote
  -> payment
  -> shop fulfillment
  -> status tracking
  -> receipt
```

This makes Tobi similar in spirit to a WhatsApp-native task assistant rather than a generic FAQ bot.

---

## 3. Target Users

### 3.1 Customer segments

- College students
- Hostel residents
- Coaching-center students
- Office employees
- Visa/document applicants
- Lawyers and clerks
- Small businesses
- People who already send files to print shops on WhatsApp

### 3.2 Merchant segments

- Campus print shops
- Cyber cafés
- Xerox/print shops
- Document centers
- Coaching-center print counters
- Coworking-space print desks
- Multi-branch local print chains

---

## 4. MVP Scope

### 4.1 Customer-side MVP

The customer should be able to:

- Start a WhatsApp conversation.
- Upload a PDF/image/document.
- Provide print preferences in natural language.
- Answer missing questions through buttons or short replies.
- Receive a quote.
- Pay using a payment link or UPI intent link.
- Receive confirmation after payment webhook succeeds.
- Track order status.
- Receive pickup token/QR code or delivery confirmation.

### 4.2 Shop-side MVP

The print shop should be able to:

- Receive WhatsApp alert for a new paid order.
- Open an order dashboard link.
- Download the file.
- View print instructions.
- View payment status.
- Mark order as accepted, printing, ready, dispatched, delivered, or cancelled.
- Trigger customer notifications through status changes.

### 4.3 Admin MVP

Admin should be able to:

- View all shops.
- View all orders.
- View failed payments.
- View unassigned orders.
- Edit shop pricing rules.
- Manually update order status.
- Trigger refunds manually in the payment provider dashboard or via backend endpoint later.

---

## 5. Non-Goals for MVP

Do not build these in v1:

- Fully autonomous refunds.
- Marketplace routing between multiple shops.
- Complex OCR-heavy document understanding.
- In-app wallet.
- Subscription/AutoPay mandate system.
- Native WhatsApp payment-message integration unless the payment provider and BSP support it in the target region.
- AI-based price calculation.
- AI-based payment confirmation.
- Full CRM system.

---

## 6. Recommended Technical Architecture

```text
Twilio WhatsApp Webhook
        |
        v
Cloudflare Worker API
        |
        +--> Message Normalizer
        +--> File Handler
        +--> Conversation State Manager
        +--> Gemini AI Router
        +--> Order Workflow Engine
        +--> Payment Service
        +--> Notification Service
        |
        +--> Cloudflare D1: relational data
        +--> Cloudflare R2: uploaded files
        +--> Cloudflare KV: short-lived session/cache/config
        +--> Cloudflare Queues: async jobs
        |
        v
Shop Dashboard / Admin Dashboard
```

---

## 7. Technology Choices

### 7.1 TypeScript

Use TypeScript for all backend code, shared schemas, validation, and dashboard code.

Recommended libraries:

- `zod` for runtime validation.
- `hono` for Cloudflare Worker routing.
- `drizzle-orm` or SQL migrations for D1 access.
- `@google/genai` or Google Gemini SDK for Gemini calls.
- `twilio` only if compatible with the Cloudflare runtime; otherwise call Twilio REST API using `fetch`.
- `nanoid` or custom ID generator for order IDs.

### 7.2 Cloudflare

Use Cloudflare as the edge backend.

Suggested Cloudflare products:

- **Workers:** API/webhook runtime.
- **D1:** relational database for orders, shops, customers, payments, events.
- **R2:** secure storage for uploaded files.
- **KV:** short-lived session data, idempotency locks, shop config cache.
- **Queues:** async processing for AI extraction, notifications, payment reconciliation, and status updates.
- **Pages or Workers static assets:** dashboard hosting.

### 7.3 Twilio

Use Twilio for WhatsApp messaging.

Twilio should handle:

- Inbound WhatsApp webhook.
- Outbound WhatsApp messages.
- WhatsApp sandbox during development.
- Production WhatsApp sender later.

Important:

> Twilio is the WhatsApp messaging provider. Payment collection should usually be handled by a separate payment provider such as Razorpay, Stripe, PayU, Cashfree, or a UPI link flow depending on the launch geography.

### 7.4 Gemini

Use Gemini as the primary AI provider.

Recommended model strategy:

- **Default:** Gemini Flash-Lite or the cheapest available Gemini low-latency model.
- **Escalation:** Gemini Flash for complex or ambiguous order extraction.
- **Rare escalation:** Gemini Pro only for difficult support/dispute cases.

For the MVP, it is acceptable to start with only one Gemini model and add routing later.

---

## 8. AI Responsibility Boundary

The model may do:

- Intent detection.
- Field extraction.
- Missing-field detection.
- Short WhatsApp response drafting.
- Classification of customer support requests.
- Summarization of order instructions for the shop.

The model must not do:

- Decide final price.
- Confirm payment success.
- Decide refund eligibility.
- Mark order as paid.
- Mark order as delivered.
- Modify ledger balances.
- Send messages without backend approval.

All money-critical decisions must be deterministic backend logic.

---

## 9. Core User Flows

### 9.1 New Print Order Flow

```text
Customer sends file/message
  -> Twilio webhook receives message
  -> Worker stores raw message
  -> Worker downloads media from Twilio
  -> File stored in R2
  -> Backend counts PDF pages if possible
  -> Gemini extracts print preferences
  -> Backend checks missing fields
  -> Bot asks missing questions
  -> User completes preferences
  -> Backend calculates quote
  -> Bot sends quote and payment link
  -> Payment webhook confirms success
  -> Order marked PAID
  -> Shop receives WhatsApp alert + dashboard link
  -> Customer receives confirmation
```

### 9.2 Missing Information Flow

If required fields are missing, ask one compact question at a time.

Required fields for MVP:

- File
- Number of copies
- Color mode: `black_and_white` or `color`
- Sides: `single_sided` or `double_sided`
- Paper size: default to `A4` if not specified
- Binding: `none`, `staple`, `spiral`, `soft_bind`, etc.
- Fulfillment: `pickup` or `delivery`
- Pickup/delivery time if relevant

Example:

```text
Got it. Should I print this single-sided or double-sided?
```

### 9.3 Quote Flow

The backend calculates:

```text
base printing cost
+ color surcharge
+ paper size surcharge
+ binding cost
+ delivery fee
+ urgent fee, if selected
+ platform/convenience fee, if enabled
= final payable amount
```

Example reply:

```text
Here is your quote:

18 pages x 2 copies, B&W, double-sided
Binding: Spiral
Pickup: 5:00 PM

Total: ₹76

Pay now to confirm your order.
```

### 9.4 Payment Flow

MVP approach:

- Generate a payment link using a payment provider.
- Send the payment link over WhatsApp.
- Wait for payment provider webhook.
- Mark payment as `succeeded`, `failed`, or `expired`.

Do not rely on screenshots.

Status flow:

```text
QUOTE_CREATED
  -> PAYMENT_LINK_SENT
  -> PAYMENT_PENDING
  -> PAID
  -> SHOP_NOTIFIED
```

### 9.5 Shop Fulfillment Flow

Shop receives:

```text
New paid print order: #TOBI-1042
Customer: Sai
Amount paid: ₹76
File: Assignment.pdf
Pages: 18
Copies: 2
Print: B&W, double-sided, A4
Binding: Spiral
Fulfillment: Pickup at 5:00 PM
Open dashboard: https://app.example.com/shop/orders/TOBI-1042
```

Shop dashboard actions:

- Accept order
- Reject order
- Mark printing
- Mark ready
- Mark dispatched
- Mark delivered
- Request customer clarification

### 9.6 Status Update Flow

When the shop changes status:

```text
Dashboard action
  -> Worker API update
  -> D1 order status update
  -> Queue notification job
  -> Twilio sends WhatsApp update to customer
```

Example customer updates:

```text
Your order #TOBI-1042 is now printing.
```

```text
Your order #TOBI-1042 is ready for pickup. Show this code at the counter: 8492.
```

---

## 10. Order State Machine

Use strict states.

```text
DRAFT
AWAITING_FILE
AWAITING_DETAILS
QUOTE_READY
PAYMENT_LINK_SENT
PAYMENT_PENDING
PAID
SHOP_NOTIFIED
ACCEPTED
PRINTING
READY_FOR_PICKUP
OUT_FOR_DELIVERY
COMPLETED
CANCELLED
REFUND_PENDING
REFUNDED
FAILED
```

Recommended transition rules:

| From | To | Trigger |
|---|---|---|
| DRAFT | AWAITING_FILE | User starts order without file |
| DRAFT | AWAITING_DETAILS | File received, missing print details |
| AWAITING_DETAILS | QUOTE_READY | Required fields complete |
| QUOTE_READY | PAYMENT_LINK_SENT | Payment link created |
| PAYMENT_LINK_SENT | PAYMENT_PENDING | User opens/starts payment, optional |
| PAYMENT_LINK_SENT/PAYMENT_PENDING | PAID | Payment webhook success |
| PAID | SHOP_NOTIFIED | Shop alert sent |
| SHOP_NOTIFIED | ACCEPTED | Shop accepts |
| ACCEPTED | PRINTING | Shop starts printing |
| PRINTING | READY_FOR_PICKUP | Shop marks ready |
| READY_FOR_PICKUP | COMPLETED | Pickup confirmed |
| Any pre-paid state | CANCELLED | User cancels before payment |
| PAID/ACCEPTED/PRINTING | REFUND_PENDING | Shop rejects/refund needed |
| REFUND_PENDING | REFUNDED | Payment provider confirms refund |
```

---

## 11. Data Model

### 11.1 Tables

Use Cloudflare D1.

#### `customers`

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### `shops`

```sql
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### `shop_pricing_rules`

```sql
CREATE TABLE shop_pricing_rules (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  paper_size TEXT NOT NULL,
  color_mode TEXT NOT NULL,
  side_mode TEXT NOT NULL,
  price_per_page_cents INTEGER NOT NULL,
  binding_type TEXT,
  binding_price_cents INTEGER DEFAULT 0,
  delivery_fee_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shop_id) REFERENCES shops(id)
);
```

#### `orders`

```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  shop_id TEXT,
  status TEXT NOT NULL,
  currency TEXT DEFAULT 'INR',
  subtotal_cents INTEGER DEFAULT 0,
  delivery_fee_cents INTEGER DEFAULT 0,
  platform_fee_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'not_started',
  payment_provider TEXT,
  payment_id TEXT,
  payment_link TEXT,
  pickup_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (shop_id) REFERENCES shops(id)
);
```

#### `order_files`

```sql
CREATE TABLE order_files (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  r2_key TEXT NOT NULL,
  page_count INTEGER,
  file_size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

#### `order_print_options`

```sql
CREATE TABLE order_print_options (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  copies INTEGER DEFAULT 1,
  color_mode TEXT,
  side_mode TEXT,
  paper_size TEXT DEFAULT 'A4',
  binding_type TEXT DEFAULT 'none',
  fulfillment_type TEXT,
  pickup_time TEXT,
  delivery_address TEXT,
  special_instructions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

#### `messages`

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  order_id TEXT,
  direction TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  body TEXT,
  media_count INTEGER DEFAULT 0,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

#### `order_events`

```sql
CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

#### `payments`

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_order_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL,
  raw_payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

---

## 12. API Endpoints

### 12.1 Public webhooks

```text
POST /webhooks/twilio/whatsapp
POST /webhooks/payment/:provider
```

### 12.2 Customer/order endpoints

```text
GET  /orders/:publicId
POST /orders/:publicId/cancel
GET  /orders/:publicId/receipt
```

### 12.3 Shop dashboard endpoints

```text
GET  /shop/orders
GET  /shop/orders/:orderId
POST /shop/orders/:orderId/accept
POST /shop/orders/:orderId/reject
POST /shop/orders/:orderId/status
POST /shop/orders/:orderId/message-customer
GET  /shop/orders/:orderId/files/:fileId/download-url
```

### 12.4 Admin endpoints

```text
GET  /admin/shops
POST /admin/shops
GET  /admin/orders
GET  /admin/payments
POST /admin/pricing-rules
```

---

## 13. Cloudflare Bindings

Example `wrangler.toml` structure:

```toml
name = "tobi-api"
main = "src/index.ts"
compatibility_date = "2026-05-18"

[vars]
APP_ENV = "development"
PUBLIC_APP_URL = "https://tobi.example.com"
DEFAULT_CURRENCY = "INR"

[[d1_databases]]
binding = "DB"
database_name = "tobi-db"
database_id = "REPLACE_ME"

[[r2_buckets]]
binding = "FILES"
bucket_name = "tobi-files"

[[kv_namespaces]]
binding = "SESSIONS"
id = "REPLACE_ME"

[[queues.producers]]
binding = "JOB_QUEUE"
queue = "tobi-jobs"

[[queues.consumers]]
queue = "tobi-jobs"
max_batch_size = 10
max_batch_timeout = 5
```

Secrets:

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_WHATSAPP_FROM
wrangler secret put PAYMENT_PROVIDER_SECRET
wrangler secret put PAYMENT_WEBHOOK_SECRET
wrangler secret put DASHBOARD_JWT_SECRET
```

---

## 14. Suggested Repository Structure

```text
tobi/
  apps/
    api/
      src/
        index.ts
        routes/
          twilioWebhook.ts
          paymentWebhook.ts
          shopOrders.ts
          admin.ts
        services/
          gemini.ts
          twilio.ts
          payments.ts
          orders.ts
          pricing.ts
          files.ts
          notifications.ts
          stateMachine.ts
        ai/
          prompts.ts
          schemas.ts
          router.ts
          validators.ts
        db/
          client.ts
          migrations/
          schema.ts
        queues/
          consumer.ts
          jobs.ts
        utils/
          ids.ts
          time.ts
          security.ts
    dashboard/
      src/
        pages/
        components/
        api-client.ts
  packages/
    shared/
      src/
        types.ts
        orderSchemas.ts
        constants.ts
  docs/
    implementation-plan.md
    api-contracts.md
    prompts.md
    state-machine.md
```

---

## 15. Gemini Integration Design

### 15.1 Use structured extraction

The model should return structured data, not free-form order interpretation.

Example TypeScript/Zod schema:

```ts
import { z } from "zod";

export const PrintOrderExtractionSchema = z.object({
  intent: z.enum([
    "new_print_order",
    "provide_order_details",
    "ask_quote",
    "ask_status",
    "cancel_order",
    "payment_issue",
    "human_support",
    "other"
  ]),
  confidence: z.number().min(0).max(1),
  copies: z.number().int().positive().nullable(),
  colorMode: z.enum(["black_and_white", "color"]).nullable(),
  sideMode: z.enum(["single_sided", "double_sided"]).nullable(),
  paperSize: z.enum(["A4", "A3", "letter", "legal"]).nullable(),
  bindingType: z.enum(["none", "staple", "spiral", "soft_bind", "hard_bind"]).nullable(),
  fulfillmentType: z.enum(["pickup", "delivery"]).nullable(),
  pickupTime: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
  specialInstructions: z.string().nullable(),
  missingFields: z.array(z.string()),
  shouldEscalate: z.boolean(),
  customerReplyDraft: z.string()
});
```

### 15.2 System prompt

```text
You are Tobi, a WhatsApp print-order assistant.
Your job is to understand customer messages and extract print-order details.
Return only valid JSON matching the provided schema.
Do not calculate prices.
Do not confirm payment.
Do not promise order completion.
Do not invent file details.
If information is missing, include it in missingFields.
Keep customerReplyDraft short, friendly, and WhatsApp-appropriate.
```

### 15.3 Extraction examples

Customer:

```text
Print this 2 copies bw spiral pickup at 5
```

Expected extraction:

```json
{
  "intent": "new_print_order",
  "confidence": 0.94,
  "copies": 2,
  "colorMode": "black_and_white",
  "sideMode": null,
  "paperSize": null,
  "bindingType": "spiral",
  "fulfillmentType": "pickup",
  "pickupTime": "17:00",
  "deliveryAddress": null,
  "specialInstructions": null,
  "missingFields": ["sideMode"],
  "shouldEscalate": false,
  "customerReplyDraft": "Got it. Should I print it single-sided or double-sided?"
}
```

### 15.4 Escalation logic

Escalate from Flash-Lite to Flash when:

- `confidence < 0.75`
- `shouldEscalate = true`
- More than one file has different instructions.
- User mentions payment failure/refund/dispute.
- Message length is unusually long.
- User appears angry or confused.
- Extraction output fails schema validation twice.

---

## 16. Tool-Calling Design

Even if Gemini supports tool/function calling, keep a backend approval layer.

Possible tool definitions:

```ts
type ToolName =
  | "get_active_order"
  | "create_order"
  | "update_print_options"
  | "calculate_quote"
  | "create_payment_link"
  | "check_order_status"
  | "cancel_order"
  | "handoff_to_human";
```

Recommended v1 approach:

1. Use Gemini mainly for extraction.
2. Backend decides the next tool/action.
3. Later, enable tool calling for more flexible flows.

Reason:

> Extraction-first is easier to test, cheaper, and safer than letting the model directly choose actions early in development.

---

## 17. Pricing Engine

Pricing must be deterministic.

Example pricing config:

```ts
export type PricingRule = {
  paperSize: "A4" | "A3" | "letter" | "legal";
  colorMode: "black_and_white" | "color";
  sideMode: "single_sided" | "double_sided";
  pricePerPageCents: number;
};

export type BindingPrice = {
  bindingType: "none" | "staple" | "spiral" | "soft_bind" | "hard_bind";
  priceCents: number;
};
```

Quote function:

```ts
function calculateQuote(input: {
  pageCount: number;
  copies: number;
  colorMode: string;
  sideMode: string;
  paperSize: string;
  bindingType: string;
  fulfillmentType: string;
}): Quote {
  // deterministic calculation only
}
```

Important:

- Never allow AI-generated totals.
- Always recalculate quote server-side before payment.
- Store quote snapshot used for payment.

---

## 18. File Handling

### 18.1 Inbound files

Twilio inbound media should be downloaded by the backend and stored in R2.

Store metadata:

- Original filename if available
- MIME type
- File size
- R2 key
- Page count if PDF
- Uploaded timestamp

### 18.2 PDF page count

Options:

- Use a lightweight PDF parser if compatible with Cloudflare Workers.
- If not compatible, push file processing to a separate worker/runtime.
- For MVP, support PDFs first and ask manually if page count cannot be detected.

Fallback message:

```text
I received the file, but I could not detect the page count automatically. How many pages should I print?
```

### 18.3 Secure file URLs

Do not expose public R2 object URLs directly.

Use signed or short-lived dashboard download URLs.

---

## 19. Payment Design

### 19.1 MVP payment approach

Use a payment provider to create payment links.

Options depending on geography:

- Razorpay payment links / UPI intent links
- Stripe payment links
- PayU links
- Cashfree links
- Manual UPI deep link for prototype only

Flow:

```text
Quote ready
  -> create payment provider order/link
  -> send WhatsApp message with payment link
  -> payment provider webhook confirms success
  -> update D1 payments table
  -> update order status to PAID
  -> notify shop
```

### 19.2 Webhook verification

Always verify payment webhooks using provider signature verification.

Rules:

- Ignore duplicate webhook events using idempotency keys.
- Never mark order paid from customer message or screenshot.
- Payment success must come from provider webhook or verified provider API lookup.

### 19.3 Future WhatsApp Payments

If the target region and provider support WhatsApp-native payment messages, add it later behind the same `PaymentService` interface.

```ts
interface PaymentService {
  createPaymentRequest(order: Order): Promise<PaymentRequest>;
  verifyWebhook(request: Request): Promise<PaymentEvent>;
  refundPayment(paymentId: string, amountCents: number): Promise<RefundResult>;
}
```

---

## 20. Twilio WhatsApp Integration

### 20.1 Inbound webhook

Twilio will send inbound WhatsApp messages to:

```text
POST /webhooks/twilio/whatsapp
```

Expected responsibilities:

1. Verify Twilio request signature.
2. Parse message body and media fields.
3. Upsert customer by WhatsApp number.
4. Store raw message.
5. Download media if present.
6. Continue or create order conversation.
7. Queue AI extraction job if needed.
8. Respond quickly or send async message later.

### 20.2 Outbound messages

Create a `TwilioService` abstraction:

```ts
interface WhatsAppService {
  sendText(to: string, body: string): Promise<void>;
  sendMedia(to: string, body: string, mediaUrl: string): Promise<void>;
  sendTemplate?(to: string, templateId: string, variables: Record<string, string>): Promise<void>;
}
```

### 20.3 Message templates

For production, business-initiated messages may require approved WhatsApp templates.

Useful templates:

- Order confirmed
- Payment reminder
- Order ready
- Delivery update
- Receipt
- Support handoff

---

## 21. Conversation State Management

Use state linked to customer and active order.

Session lookup:

```text
customer whatsapp number
  -> active order in non-terminal state
  -> conversation context
```

Use KV for short-lived state cache, but D1 remains source of truth.

Example session data:

```json
{
  "customerId": "cus_123",
  "activeOrderId": "ord_123",
  "lastIntent": "provide_order_details",
  "awaitingField": "sideMode",
  "updatedAt": "2026-05-18T10:00:00Z"
}
```

---

## 22. Queue Jobs

Use Cloudflare Queues for async operations:

```ts
type Job =
  | { type: "PROCESS_INBOUND_MESSAGE"; messageId: string }
  | { type: "DOWNLOAD_TWILIO_MEDIA"; messageId: string }
  | { type: "RUN_AI_EXTRACTION"; orderId: string; messageId: string }
  | { type: "SEND_CUSTOMER_MESSAGE"; customerId: string; body: string }
  | { type: "SEND_SHOP_ALERT"; orderId: string }
  | { type: "RECONCILE_PAYMENT"; paymentId: string }
  | { type: "GENERATE_RECEIPT"; orderId: string };
```

Keep webhook response fast. Do not do slow file downloads, AI calls, or payment reconciliation inside the webhook path unless necessary.

---

## 23. Dashboard Requirements

### 23.1 Shop dashboard pages

- Login / magic link
- Orders list
- Order detail
- File download
- Status update controls
- Pricing settings
- Daily summary

### 23.2 Order list columns

- Order ID
- Customer
- Paid amount
- Status
- Ready by
- Created time
- File count
- Actions

### 23.3 Order detail fields

- Customer phone/name
- File list
- Download buttons
- Page count
- Copies
- Color mode
- Side mode
- Binding
- Pickup/delivery info
- Payment status
- Status timeline
- Internal notes

---

## 24. Security Requirements

### 24.1 Webhook security

- Verify Twilio webhook signatures.
- Verify payment webhook signatures.
- Reject unsigned or invalid requests.
- Store raw payload for audit.

### 24.2 File security

- Store files in private R2 bucket.
- Use short-lived signed URLs for downloads.
- Limit dashboard access by shop.
- Do not expose file URLs in public WhatsApp messages.

### 24.3 Data privacy

- Do not send full documents to the AI model unless needed.
- Prefer metadata extraction in backend.
- Send only customer text and minimal file metadata to Gemini.
- Redact phone numbers in logs where possible.

### 24.4 Admin security

- Use authenticated admin dashboard.
- Use role-based access for shop users.
- Audit all manual status/payment changes.

---

## 25. Reliability Requirements

### 25.1 Idempotency

Use idempotency keys for:

- Twilio inbound messages
- Payment webhooks
- Order creation
- Payment link creation
- Shop alerts
- Customer status messages

### 25.2 Retries

Retry transient failures for:

- Twilio outbound messages
- Gemini API calls
- Payment provider API calls
- R2 file uploads
- Queue jobs

### 25.3 Dead-letter handling

Failed queue jobs should be visible in admin.

Store failed job details:

- Job type
- Payload
- Error
- Retry count
- Last attempted at

---

## 26. Observability

Track these events:

- Inbound message received
- Media download started/completed/failed
- AI extraction started/completed/failed
- Quote created
- Payment link created
- Payment succeeded/failed
- Shop notified
- Status updated
- Customer notified

Metrics:

- Time from first message to quote
- Time from quote to payment
- Payment conversion rate
- Average order value
- Failed extraction rate
- Human handoff rate
- Shop acceptance time
- Print completion time

---

## 27. Testing Strategy

### 27.1 Unit tests

- Pricing engine
- State machine transitions
- Gemini extraction validator
- Payment webhook parser
- Twilio webhook parser
- Order status update logic

### 27.2 Integration tests

- Inbound WhatsApp message to order draft
- File upload to R2
- Quote calculation
- Payment webhook to paid order
- Paid order to shop alert
- Dashboard status update to customer message

### 27.3 AI evaluation tests

Create a test set of customer messages:

```text
print this 2 copies bw
need color print spiral bind
how much for 40 pages double side
is my order ready
cancel my order
I paid but it still says pending
print first file color and second file bw
```

For each test, assert:

- Correct intent
- Correct extracted fields
- Correct missing fields
- Valid JSON schema
- No price hallucination
- No payment hallucination

---

## 28. Development Milestones

### Milestone 1 — Backend foundation

- Create Cloudflare Worker TypeScript project.
- Add Hono router.
- Configure D1, R2, KV, Queues.
- Add migrations.
- Add health endpoint.

Acceptance criteria:

- Worker deploys.
- `/health` returns OK.
- D1 migrations run.
- R2 write/read test works.

### Milestone 2 — Twilio WhatsApp webhook

- Connect Twilio sandbox.
- Receive inbound WhatsApp messages.
- Store customer and message.
- Send basic reply.

Acceptance criteria:

- User can message Twilio sandbox.
- Backend stores message.
- Bot replies on WhatsApp.

### Milestone 3 — File handling

- Receive media metadata.
- Download media from Twilio.
- Store file in R2.
- Link file to order.
- Detect PDF page count if possible.

Acceptance criteria:

- PDF sent on WhatsApp appears in R2.
- File appears on order record.
- Page count is stored or fallback question is sent.

### Milestone 4 — Gemini extraction

- Add Gemini service.
- Add schema validation.
- Extract order fields from messages.
- Ask missing questions.

Acceptance criteria:

- Natural language print instructions become validated JSON.
- Bot asks for missing fields.
- No pricing is generated by AI.

### Milestone 5 — Pricing and quote

- Add shop pricing rules.
- Add quote calculation.
- Send quote to customer.

Acceptance criteria:

- Complete order details produce deterministic quote.
- Quote is stored.
- Customer receives quote message.

### Milestone 6 — Payment link and webhook

- Add payment provider interface.
- Create payment link.
- Receive verified payment webhook.
- Mark order paid.

Acceptance criteria:

- Quote creates payment link.
- Payment webhook updates order to `PAID`.
- Duplicate webhook does not duplicate order/payment.

### Milestone 7 — Shop dashboard

- Build order list.
- Build order detail.
- Add file download.
- Add status update buttons.

Acceptance criteria:

- Shop can view paid orders.
- Shop can download file.
- Shop can update status.

### Milestone 8 — Notifications

- Notify shop after payment success.
- Notify customer after shop status changes.
- Send pickup code when ready.

Acceptance criteria:

- Paid order triggers shop WhatsApp alert.
- Status update triggers customer WhatsApp message.

### Milestone 9 — Demo polish

- Add sample shop.
- Add sample pricing.
- Add branded landing/dashboard UI.
- Add demo script.
- Add logs/analytics dashboard.

Acceptance criteria:

- End-to-end demo works in under 3 minutes.

---

## 29. Demo Script

1. Customer sends PDF on WhatsApp.
2. Customer sends: `2 copies B&W spiral binding pickup at 5`.
3. Tobi asks: `Single-sided or double-sided?`
4. Customer replies: `double`.
5. Tobi sends quote.
6. Customer pays using payment link.
7. Payment webhook marks order paid.
8. Shop receives WhatsApp alert.
9. Shop opens dashboard and marks order printing.
10. Customer receives update.
11. Shop marks ready.
12. Customer receives pickup code.

---

## 30. Important Edge Cases

### 30.1 User sends file but no instructions

Reply:

```text
I received your file. How would you like it printed? For example: 2 copies, B&W, double-sided, spiral binding.
```

### 30.2 User sends instructions but no file

Reply:

```text
Got it. Please send the file you want printed.
```

### 30.3 Payment failed

Reply:

```text
Payment did not go through. You can retry using this link: {paymentLink}
```

### 30.4 Payment success but shop rejects

Reply:

```text
The shop could not accept this order. We will initiate a refund or help route it to another shop.
```

### 30.5 AI extraction uncertain

Reply:

```text
Just to confirm, do you want {summary}? Reply Yes or tell me what to change.
```

---

## 31. Environment Variables

```text
APP_ENV=development
PUBLIC_APP_URL=https://tobi.example.com
GEMINI_API_KEY=...
GEMINI_DEFAULT_MODEL=gemini-flash-lite-latest
GEMINI_ESCALATION_MODEL=gemini-flash-latest
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
PAYMENT_PROVIDER=razorpay
PAYMENT_PROVIDER_SECRET=...
PAYMENT_WEBHOOK_SECRET=...
DASHBOARD_JWT_SECRET=...
```

Use actual currently available Gemini model IDs in implementation. Keep model IDs in environment variables, not hardcoded.

---

## 32. Recommended AI Provider Interface

Even though Gemini is primary, keep the interface provider-agnostic.

```ts
export interface AIProvider {
  extractPrintOrder(input: ExtractPrintOrderInput): Promise<PrintOrderExtraction>;
  draftCustomerReply(input: DraftReplyInput): Promise<string>;
  summarizeForShop(input: ShopSummaryInput): Promise<string>;
}
```

Benefits:

- Easier to test with mocks.
- Easier to swap Gemini model versions.
- Easier to add another provider later if needed.

---

## 33. Initial Codex Task List

Use these as implementation tasks in Codex.

### Task 1

Create a TypeScript Cloudflare Worker project using Hono, Wrangler, D1, R2, KV, and Queues bindings. Add `/health` endpoint and basic error handling.

### Task 2

Add D1 migrations for customers, shops, orders, order_files, order_print_options, messages, payments, and order_events.

### Task 3

Implement Twilio WhatsApp inbound webhook route with signature verification, message parsing, customer upsert, message storage, and simple reply.

### Task 4

Implement Twilio media download service and R2 storage for inbound WhatsApp files.

### Task 5

Implement Gemini extraction service using structured JSON output and Zod validation.

### Task 6

Implement order state machine and active-order session lookup.

### Task 7

Implement deterministic pricing engine with configurable shop pricing rules.

### Task 8

Implement payment provider interface with a mock provider first, then integrate real provider payment links and webhook verification.

### Task 9

Implement shop notification service over Twilio WhatsApp.

### Task 10

Build minimal shop dashboard with order list, order detail, file download, and status update actions.

### Task 11

Implement queue consumer for AI extraction, shop alerts, and customer notifications.

### Task 12

Add tests for extraction validation, pricing, state transitions, webhook idempotency, and payment success flow.

---

## 34. Product Pitch

Use this one-liner:

> Tobi is a WhatsApp-native print assistant that turns messy document messages into paid, trackable print orders.

Longer pitch:

> Customers send a file to Tobi on WhatsApp, choose print options in natural language, receive a quote, pay, and track pickup or delivery. Print shops get structured paid orders in a dashboard instead of managing files, screenshots, and status messages manually.

Technical pitch:

> Tobi uses Gemini for low-latency WhatsApp intent detection and structured print-order extraction. Cloudflare Workers handle the webhook and workflow layer, D1 stores orders, R2 stores files, Queues handle async jobs, Twilio powers WhatsApp messaging, and payment confirmation is handled by verified webhooks. The AI never controls money-critical decisions.

---

## 35. Success Metrics

Track these metrics during pilot:

- Number of inbound conversations
- Number of files uploaded
- Quote generation rate
- Payment conversion rate
- Average order value
- Average time to quote
- Average time to paid order
- Average fulfillment time
- Human handoff rate
- Failed AI extraction rate
- Repeat customer rate
- Shop satisfaction

---

## 36. Launch Plan

### Pilot 1

- One local print shop.
- Twilio sandbox or approved WhatsApp sender.
- Manual payment link acceptable.
- Dashboard can be basic.

### Pilot 2

- 3 to 5 shops near college/hostel area.
- Real payment webhooks.
- Shop-specific pricing.
- Daily sales report.

### Pilot 3

- Campus/coaching-center package.
- Delivery support.
- Role-based shop staff accounts.
- Analytics dashboard.

---

## 37. Revenue Model Recommendation

Start with:

```text
₹999/month per shop + 3% per completed paid order
```

Optional add-ons:

- Delivery fee margin
- Urgent print fee
- Institution/campus plan
- Multi-branch plan
- White-label setup fee

---

## 38. References

Use official docs during implementation:

- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Twilio WhatsApp docs: https://www.twilio.com/docs/whatsapp
- Cloudflare Workers TypeScript docs: https://developers.cloudflare.com/workers/languages/typescript/
- Cloudflare D1 docs: https://developers.cloudflare.com/d1/
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- Cloudflare Queues docs: https://developers.cloudflare.com/queues/
- Cloudflare KV docs: https://developers.cloudflare.com/kv/

---

## 39. Final Implementation Principle

Keep the system boring and reliable:

```text
AI for language understanding.
Backend for business logic.
Webhooks for truth.
Database for state.
Queues for async work.
Dashboard for fulfillment.
```

That is the architecture most likely to work in production.
