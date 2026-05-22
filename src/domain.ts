import { z } from "zod";

export const orderStatuses = [
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
  "COMPLETED",
  "CANCELLED",
  "FAILED"
] as const;

export const terminalStatuses = ["COMPLETED", "CANCELLED", "FAILED"] as const;

export const printOptionsSchema = z.object({
  copies: z.number().int().positive().nullable().default(null),
  colorMode: z.enum(["black_and_white", "color"]).nullable().default(null),
  sideMode: z.enum(["single_sided", "double_sided"]).nullable().default(null),
  paperSize: z.enum(["A4", "A3", "letter", "legal"]).default("A4"),
  bindingType: z.enum(["none", "staple", "spiral", "soft_bind", "hard_bind"]).default("none"),
  pagesPerSheet: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).default(1),
  fulfillmentType: z.literal("pickup").default("pickup"),
  pickupTime: z.string().nullable().default(null),
  pageCount: z.number().int().positive().nullable().default(null),
  specialInstructions: z.string().nullable().default(null)
});

export const extractionSchema = z.object({
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
  colorMode: printOptionsSchema.shape.colorMode,
  sideMode: printOptionsSchema.shape.sideMode,
  paperSize: z.enum(["A4", "A3", "letter", "legal"]).nullable(),
  bindingType: z.enum(["none", "staple", "spiral", "soft_bind", "hard_bind"]).nullable(),
  pagesPerSheet: printOptionsSchema.shape.pagesPerSheet.nullable(),
  fulfillmentType: z.literal("pickup").nullable(),
  pickupTime: z.string().nullable(),
  pageCount: z.number().int().positive().nullable(),
  specialInstructions: z.string().nullable(),
  missingFields: z.array(z.string()),
  shouldEscalate: z.boolean(),
  customerReplyDraft: z.string()
});

export type OrderStatus = (typeof orderStatuses)[number];
export type PrintOptions = z.infer<typeof printOptionsSchema>;
export type PrintOrderExtraction = z.infer<typeof extractionSchema>;

export type Customer = {
  id: string;
  whatsappNumber: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderFile = {
  id: string;
  orderId: string;
  originalFilename: string | null;
  mimeType: string;
  r2Key: string;
  pageCount: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
};

export type QuoteSnapshot = {
  pages: number;
  copies: number;
  pagesPerSheet: number;
  billableSheets: number;
  lineItems: Array<{ label: string; amountPaise: number }>;
  totalPaise: number;
  currency: "INR";
};

export type PaymentStatus = "not_started" | "link_sent" | "pending" | "succeeded" | "failed" | "expired" | "cancelled";

export type Order = {
  id: string;
  publicId: string;
  customerId: string;
  customerWhatsappNumber: string | null;
  shopId: string;
  status: OrderStatus;
  currency: "INR";
  totalPaise: number;
  paymentStatus: PaymentStatus;
  paymentProvider: "razorpay_test" | null;
  paymentId: string | null;
  paymentLinkId: string | null;
  paymentLink: string | null;
  pickupCode: string | null;
  quoteSnapshot: QuoteSnapshot | null;
  printOptions: PrintOptions;
  files: OrderFile[];
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  customerId: string | null;
  orderId: string | null;
  direction: "inbound" | "outbound";
  provider: "twilio_sandbox" | "meta_cloud_api" | "demo";
  processingStatus: "processing" | "completed" | "failed";
  providerMessageId: string | null;
  body: string | null;
  mediaCount: number;
  rawPayloadJson: string;
  createdAt: string;
};

export type PricingRule = {
  paperSize: "A4" | "A3" | "letter" | "legal";
  colorMode: "black_and_white" | "color";
  sideMode: "single_sided" | "double_sided";
  pricePerPagePaise: number;
};

export type BindingPrice = {
  bindingType: NonNullable<PrintOptions["bindingType"]>;
  pricePaise: number;
};

export type PaymentRequest = {
  provider: "razorpay_test";
  paymentLinkId: string;
  paymentLink: string;
  amountPaise: number;
};

export type PaymentEvent = {
  eventId: string;
  eventType: string;
  orderId: string;
  paymentLinkId: string;
  paymentId: string | null;
  status: PaymentStatus;
  rawPayloadJson: string;
};

export type InboundWhatsAppMessage = {
  from: string;
  body: string;
  providerMessageId: string | null;
  senderName?: string | null;
  media: Array<{
    url: string;
    contentType: string;
    filename: string | null;
    sizeBytes: number | null;
    pageCount: number | null;
  }>;
  raw: Record<string, unknown>;
};
