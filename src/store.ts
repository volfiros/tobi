import {
  printOptionsSchema,
  type Customer,
  type Message,
  type Order,
  type OrderFile,
  type OrderStatus,
  type PaymentEvent,
  type PaymentRequest,
  type PrintOptions,
  type QuoteSnapshot
} from "./domain";
import { assertTransition } from "./services/stateMachine";
import { createId, createPickupCode, createPublicOrderId, nowIso } from "./utils/ids";

export interface TobiStore {
  upsertCustomer(input: { whatsappNumber: string; displayName?: string | null }): Promise<Customer>;
  createMessage(input: Omit<Message, "id" | "createdAt">): Promise<Message>;
  tryCreateMessage(input: Omit<Message, "id" | "createdAt">): Promise<{ message: Message; duplicate: boolean }>;
  attachMessageToOrder(messageId: string, orderId: string): Promise<void>;
  markMessageProcessed(messageId: string, status: Message["processingStatus"]): Promise<void>;
  findMessageByProviderId(providerMessageId: string): Promise<Message | null>;
  listInboundMessagesForOrder(orderId: string): Promise<Message[]>;
  findActiveOrder(customerId: string): Promise<Order | null>;
  createOrder(input: { customerId: string; shopId: string }): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;
  getOrderByPublicId(publicId: string): Promise<Order | null>;
  listOrders(): Promise<Order[]>;
  updatePrintOptions(orderId: string, patch: Partial<PrintOptions>): Promise<Order>;
  addOrderFile(input: Omit<OrderFile, "id" | "createdAt">): Promise<OrderFile>;
  transitionOrder(orderId: string, status: OrderStatus): Promise<Order>;
  setQuote(orderId: string, quote: QuoteSnapshot): Promise<Order>;
  setPaymentRequest(orderId: string, request: PaymentRequest): Promise<Order>;
  applyPaymentEvent(event: PaymentEvent): Promise<{ order: Order; duplicate: boolean }>;
  claimShopNotification(orderId: string): Promise<{ order: Order; claimed: boolean }>;
  addOrderEvent(orderId: string, eventType: string, eventData: unknown): Promise<void>;
}

const emptyOptions = printOptionsSchema.parse({});
const ACTIVE_PREPAYMENT_ORDER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const UNBOUNDED_ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "PAID",
  "SHOP_NOTIFIED",
  "ACCEPTED",
  "PRINTING",
  "READY_FOR_PICKUP",
];

export function isConversationActiveOrder(
  order: Order,
  now = new Date(),
): boolean {
  if (["COMPLETED", "CANCELLED", "FAILED"].includes(order.status)) {
    return false;
  }
  if (UNBOUNDED_ACTIVE_ORDER_STATUSES.includes(order.status)) return true;
  const updatedAt = Date.parse(order.updatedAt);
  if (!Number.isFinite(updatedAt)) return false;
  return now.getTime() - updatedAt <= ACTIVE_PREPAYMENT_ORDER_MAX_AGE_MS;
}

export class MemoryTobiStore implements TobiStore {
  private customers = new Map<string, Customer>();
  private customersByWhatsapp = new Map<string, string>();
  private orders = new Map<string, Order>();
  private messages = new Map<string, Message>();
  private webhookEvents = new Set<string>();

  async upsertCustomer(input: { whatsappNumber: string; displayName?: string | null }): Promise<Customer> {
    const existingId = this.customersByWhatsapp.get(input.whatsappNumber);
    const timestamp = nowIso();
    if (existingId) {
      const existing = this.customers.get(existingId);
      if (!existing) throw new Error("Customer index is corrupt");
      const updated = { ...existing, displayName: input.displayName ?? existing.displayName, updatedAt: timestamp };
      this.customers.set(updated.id, updated);
      return updated;
    }

    const customer: Customer = {
      id: createId("cus"),
      whatsappNumber: input.whatsappNumber,
      displayName: input.displayName ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.customers.set(customer.id, customer);
    this.customersByWhatsapp.set(customer.whatsappNumber, customer.id);
    return customer;
  }

  async createMessage(input: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const message = { ...input, id: createId("msg"), createdAt: nowIso() };
    this.messages.set(message.id, message);
    return message;
  }

  async tryCreateMessage(input: Omit<Message, "id" | "createdAt">): Promise<{ message: Message; duplicate: boolean }> {
    if (input.providerMessageId) {
      const existing = await this.findMessageByProviderId(input.providerMessageId);
      if (existing?.processingStatus === "completed") return { message: existing, duplicate: true };
      if (existing) return { message: existing, duplicate: false };
    }
    return { message: await this.createMessage(input), duplicate: false };
  }

  async attachMessageToOrder(messageId: string, orderId: string): Promise<void> {
    const existing = this.messages.get(messageId);
    if (existing) this.messages.set(messageId, { ...existing, orderId });
  }

  async markMessageProcessed(messageId: string, status: Message["processingStatus"]): Promise<void> {
    const existing = this.messages.get(messageId);
    if (existing) this.messages.set(messageId, { ...existing, processingStatus: status });
  }

  async findMessageByProviderId(providerMessageId: string): Promise<Message | null> {
    return Array.from(this.messages.values()).find((message) => message.providerMessageId === providerMessageId) ?? null;
  }

  async listInboundMessagesForOrder(orderId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.orderId === orderId && message.direction === "inbound")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findActiveOrder(customerId: string): Promise<Order | null> {
    return (
      Array.from(this.orders.values())
        .filter(
          (order) =>
            order.customerId === customerId && isConversationActiveOrder(order),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    );
  }

  async createOrder(input: { customerId: string; shopId: string }): Promise<Order> {
    const timestamp = nowIso();
    const order: Order = {
      id: createId("ord"),
      publicId: createPublicOrderId(),
      customerId: input.customerId,
      customerWhatsappNumber: this.customers.get(input.customerId)?.whatsappNumber ?? null,
      shopId: input.shopId,
      status: "DRAFT",
      currency: "INR",
      totalPaise: 0,
      paymentStatus: "not_started",
      paymentProvider: null,
      paymentId: null,
      paymentLinkId: null,
      paymentLink: null,
      pickupCode: null,
      quoteSnapshot: null,
      printOptions: { ...emptyOptions },
      files: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) ?? null;
  }

  async getOrderByPublicId(publicId: string): Promise<Order | null> {
    return Array.from(this.orders.values()).find((order) => order.publicId === publicId) ?? null;
  }

  async listOrders(): Promise<Order[]> {
    return Array.from(this.orders.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updatePrintOptions(orderId: string, patch: Partial<PrintOptions>): Promise<Order> {
    return this.updateOrder(orderId, (order) => ({
      ...order,
      printOptions: printOptionsSchema.parse({ ...order.printOptions, ...patch }),
      updatedAt: nowIso()
    }));
  }

  async addOrderFile(input: Omit<OrderFile, "id" | "createdAt">): Promise<OrderFile> {
    const file: OrderFile = { ...input, id: createId("file"), createdAt: nowIso() };
    await this.updateOrder(file.orderId, (order) => ({
      ...order,
      files: [...order.files, file],
      printOptions: printOptionsSchema.parse({
        ...order.printOptions,
        pageCount: order.printOptions.pageCount ?? file.pageCount
      }),
      updatedAt: nowIso()
    }));
    return file;
  }

  async transitionOrder(orderId: string, status: OrderStatus): Promise<Order> {
    return this.updateOrder(orderId, (order) => {
      if (order.status !== status) assertTransition(order.status, status);
      return {
        ...order,
        status,
        pickupCode: status === "READY_FOR_PICKUP" && !order.pickupCode ? createPickupCode() : order.pickupCode,
        updatedAt: nowIso()
      };
    });
  }

  async setQuote(orderId: string, quote: QuoteSnapshot): Promise<Order> {
    return this.updateOrder(orderId, (order) => ({
      ...order,
      quoteSnapshot: quote,
      totalPaise: quote.totalPaise,
      status: "QUOTE_READY",
      updatedAt: nowIso()
    }));
  }

  async setPaymentRequest(orderId: string, request: PaymentRequest): Promise<Order> {
    return this.updateOrder(orderId, (order) => ({
      ...order,
      status: "PAYMENT_LINK_SENT",
      paymentStatus: "link_sent",
      paymentProvider: request.provider,
      paymentLinkId: request.paymentLinkId,
      paymentLink: request.paymentLink,
      updatedAt: nowIso()
    }));
  }

  async applyPaymentEvent(event: PaymentEvent): Promise<{ order: Order; duplicate: boolean }> {
    const order = await this.getOrder(event.orderId);
    if (!order) throw new Error(`Order ${event.orderId} not found for payment event`);
    if (this.webhookEvents.has(event.eventId)) {
      return { order, duplicate: true };
    }
    this.webhookEvents.add(event.eventId);
    const updated = await this.updateOrder(order.id, (current) => ({
      ...current,
      status:
        event.status === "succeeded" && (current.status === "PAYMENT_LINK_SENT" || current.status === "PAYMENT_PENDING")
          ? "PAID"
          : current.status,
      paymentStatus: event.status,
      paymentId: event.paymentId ?? current.paymentId,
      paymentLinkId: event.paymentLinkId || current.paymentLinkId,
      updatedAt: nowIso()
    }));
    return { order: updated, duplicate: false };
  }

  async claimShopNotification(orderId: string): Promise<{ order: Order; claimed: boolean }> {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (order.status !== "PAID") return { order, claimed: false };
    const updated = await this.transitionOrder(orderId, "SHOP_NOTIFIED");
    return { order: updated, claimed: true };
  }

  async addOrderEvent(_orderId: string, _eventType: string, _eventData: unknown): Promise<void> {
    return;
  }

  private async updateOrder(orderId: string, updater: (order: Order) => Order): Promise<Order> {
    const existing = this.orders.get(orderId);
    if (!existing) throw new Error(`Order ${orderId} not found`);
    const updated = updater(existing);
    this.orders.set(orderId, updated);
    return updated;
  }
}

export class D1TobiStore extends MemoryTobiStore {
  constructor(private readonly db: D1Database) {
    super();
  }

  override async upsertCustomer(input: { whatsappNumber: string; displayName?: string | null }): Promise<Customer> {
    const existing = await this.db
      .prepare("SELECT * FROM customers WHERE whatsapp_number = ?1")
      .bind(input.whatsappNumber)
      .first<CustomerRow>();
    const timestamp = nowIso();
    if (existing) {
      await this.db
        .prepare("UPDATE customers SET display_name = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(input.displayName ?? existing.display_name, timestamp, existing.id)
        .run();
      return rowToCustomer({ ...existing, display_name: input.displayName ?? existing.display_name, updated_at: timestamp });
    }

    const customer: Customer = {
      id: createId("cus"),
      whatsappNumber: input.whatsappNumber,
      displayName: input.displayName ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.db
      .prepare(
        "INSERT INTO customers (id, whatsapp_number, display_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"
      )
      .bind(customer.id, customer.whatsappNumber, customer.displayName, customer.createdAt, customer.updatedAt)
      .run();
    return customer;
  }

  override async createMessage(input: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const result = await this.tryCreateMessage(input);
    return result.message;
  }

  override async tryCreateMessage(input: Omit<Message, "id" | "createdAt">): Promise<{ message: Message; duplicate: boolean }> {
    if (input.providerMessageId) {
      const existing = await this.findMessageByProviderId(input.providerMessageId);
      if (existing) return { message: existing, duplicate: existing.processingStatus === "completed" };
    }
    const message = { ...input, id: createId("msg"), createdAt: nowIso() };
    const inserted = await this.db
      .prepare(
        "INSERT OR IGNORE INTO messages (id, customer_id, order_id, direction, provider, processing_status, provider_message_id, body, media_count, raw_payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
      )
      .bind(
        message.id,
        message.customerId,
        message.orderId,
        message.direction,
        message.provider,
        message.processingStatus,
        message.providerMessageId,
        message.body,
        message.mediaCount,
        message.rawPayloadJson,
        message.createdAt
      )
      .run();
    if (inserted.meta.changes === 0 && input.providerMessageId) {
      const existing = await this.findMessageByProviderId(input.providerMessageId);
      if (existing) return { message: existing, duplicate: existing.processingStatus === "completed" };
    }
    return { message, duplicate: false };
  }

  override async findMessageByProviderId(providerMessageId: string): Promise<Message | null> {
    const row = await this.db
      .prepare("SELECT * FROM messages WHERE provider_message_id = ?1 LIMIT 1")
      .bind(providerMessageId)
      .first<MessageRow>();
    return row ? rowToMessage(row) : null;
  }

  override async listInboundMessagesForOrder(orderId: string): Promise<Message[]> {
    const result = await this.db
      .prepare("SELECT * FROM messages WHERE order_id = ?1 AND direction = 'inbound' ORDER BY created_at")
      .bind(orderId)
      .all<MessageRow>();
    return result.results.map(rowToMessage);
  }

  override async attachMessageToOrder(messageId: string, orderId: string): Promise<void> {
    await this.db.prepare("UPDATE messages SET order_id = COALESCE(order_id, ?1) WHERE id = ?2").bind(orderId, messageId).run();
  }

  override async markMessageProcessed(messageId: string, status: Message["processingStatus"]): Promise<void> {
    await this.db.prepare("UPDATE messages SET processing_status = ?1 WHERE id = ?2").bind(status, messageId).run();
  }

  override async findActiveOrder(customerId: string): Promise<Order | null> {
    const recentCutoff = new Date(
      Date.now() - ACTIVE_PREPAYMENT_ORDER_MAX_AGE_MS,
    ).toISOString();
    const row = await this.db
      .prepare(
        `${orderSelectSql()} WHERE orders.customer_id = ?1 AND orders.status NOT IN ('COMPLETED', 'CANCELLED', 'FAILED') AND (orders.status IN ('PAID', 'SHOP_NOTIFIED', 'ACCEPTED', 'PRINTING', 'READY_FOR_PICKUP') OR orders.updated_at >= ?2) ORDER BY orders.updated_at DESC LIMIT 1`
      )
      .bind(customerId, recentCutoff)
      .first<OrderRow>();
    return row ? this.hydrateOrder(row) : null;
  }

  override async createOrder(input: { customerId: string; shopId: string }): Promise<Order> {
    const timestamp = nowIso();
    const customer = await this.db.prepare("SELECT * FROM customers WHERE id = ?1").bind(input.customerId).first<CustomerRow>();
    const order: Order = {
      id: createId("ord"),
      publicId: createPublicOrderId(),
      customerId: input.customerId,
      customerWhatsappNumber: customer?.whatsapp_number ?? null,
      shopId: input.shopId,
      status: "DRAFT",
      currency: "INR",
      totalPaise: 0,
      paymentStatus: "not_started",
      paymentProvider: null,
      paymentId: null,
      paymentLinkId: null,
      paymentLink: null,
      pickupCode: null,
      quoteSnapshot: null,
      printOptions: { ...emptyOptions },
      files: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.db
      .prepare(
        "INSERT INTO orders (id, public_id, customer_id, shop_id, status, currency, total_paise, payment_status, print_options_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
      )
      .bind(
        order.id,
        order.publicId,
        order.customerId,
        order.shopId,
        order.status,
        order.currency,
        order.totalPaise,
        order.paymentStatus,
        JSON.stringify(order.printOptions),
        order.createdAt,
        order.updatedAt
      )
      .run();
    return order;
  }

  override async getOrder(orderId: string): Promise<Order | null> {
    const row = await this.db.prepare(`${orderSelectSql()} WHERE orders.id = ?1`).bind(orderId).first<OrderRow>();
    return row ? this.hydrateOrder(row) : null;
  }

  override async getOrderByPublicId(publicId: string): Promise<Order | null> {
    const row = await this.db.prepare(`${orderSelectSql()} WHERE orders.public_id = ?1`).bind(publicId).first<OrderRow>();
    return row ? this.hydrateOrder(row) : null;
  }

  override async listOrders(): Promise<Order[]> {
    const result = await this.db.prepare(`${orderSelectSql()} ORDER BY orders.created_at DESC`).all<OrderRow>();
    return Promise.all(result.results.map((row) => this.hydrateOrder(row)));
  }

  override async updatePrintOptions(orderId: string, patch: Partial<PrintOptions>): Promise<Order> {
    const order = await this.requireOrder(orderId);
    const printOptions = printOptionsSchema.parse({ ...order.printOptions, ...patch });
    await this.db
      .prepare("UPDATE orders SET print_options_json = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(JSON.stringify(printOptions), nowIso(), orderId)
      .run();
    return this.requireOrder(orderId);
  }

  override async addOrderFile(input: Omit<OrderFile, "id" | "createdAt">): Promise<OrderFile> {
    const file: OrderFile = { ...input, id: createId("file"), createdAt: nowIso() };
    await this.db
      .prepare(
        "INSERT INTO order_files (id, order_id, original_filename, mime_type, r2_key, page_count, file_size_bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
      )
      .bind(
        file.id,
        file.orderId,
        file.originalFilename,
        file.mimeType,
        file.r2Key,
        file.pageCount,
        file.fileSizeBytes,
        file.createdAt
      )
      .run();
    const order = await this.requireOrder(file.orderId);
    if (!order.printOptions.pageCount && file.pageCount) {
      await this.updatePrintOptions(file.orderId, { pageCount: file.pageCount });
    }
    return file;
  }

  override async transitionOrder(orderId: string, status: OrderStatus): Promise<Order> {
    const order = await this.requireOrder(orderId);
    if (order.status !== status) assertTransition(order.status, status);
    const pickupCode = status === "READY_FOR_PICKUP" && !order.pickupCode ? createPickupCode() : order.pickupCode;
    await this.db
      .prepare("UPDATE orders SET status = ?1, pickup_code = ?2, updated_at = ?3 WHERE id = ?4")
      .bind(status, pickupCode, nowIso(), orderId)
      .run();
    return this.requireOrder(orderId);
  }

  override async setQuote(orderId: string, quote: QuoteSnapshot): Promise<Order> {
    await this.db
      .prepare("UPDATE orders SET quote_snapshot_json = ?1, total_paise = ?2, status = 'QUOTE_READY', updated_at = ?3 WHERE id = ?4")
      .bind(JSON.stringify(quote), quote.totalPaise, nowIso(), orderId)
      .run();
    return this.requireOrder(orderId);
  }

  override async setPaymentRequest(orderId: string, request: PaymentRequest): Promise<Order> {
    await this.db
      .prepare(
        "UPDATE orders SET status = 'PAYMENT_LINK_SENT', payment_status = 'link_sent', payment_provider = ?1, payment_link_id = ?2, payment_link = ?3, updated_at = ?4 WHERE id = ?5"
      )
      .bind(request.provider, request.paymentLinkId, request.paymentLink, nowIso(), orderId)
      .run();
    return this.requireOrder(orderId);
  }

  override async applyPaymentEvent(event: PaymentEvent): Promise<{ order: Order; duplicate: boolean }> {
    const order = await this.requireOrder(event.orderId);
    const timestamp = nowIso();
    const inserted = await this.db
      .prepare("INSERT OR IGNORE INTO webhook_events (id, provider, event_type, raw_payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(event.eventId, "razorpay", event.eventType, event.rawPayloadJson, timestamp)
      .run();
    if (inserted.meta.changes === 0) return { order, duplicate: true };
    await this.db.batch([
      this.db
        .prepare(
          "INSERT OR IGNORE INTO payments (id, order_id, provider, provider_payment_id, provider_order_id, amount_paise, currency, status, raw_payload_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'INR', ?7, ?8, ?9, ?9)"
        )
        .bind(
          paymentRecordId(event.eventId),
          order.id,
          "razorpay_test",
          event.paymentId,
          event.paymentLinkId,
          order.totalPaise,
          event.status,
          event.rawPayloadJson,
          timestamp
        ),
      this.db
        .prepare(
          "UPDATE orders SET status = CASE WHEN ?1 = 'succeeded' AND status IN ('PAYMENT_LINK_SENT', 'PAYMENT_PENDING') THEN 'PAID' ELSE status END, payment_status = CASE WHEN payment_status = 'succeeded' THEN payment_status ELSE ?1 END, payment_id = COALESCE(?2, payment_id), payment_link_id = COALESCE(NULLIF(?3, ''), payment_link_id), updated_at = ?4 WHERE id = ?5"
        )
        .bind(event.status, event.paymentId, event.paymentLinkId, timestamp, order.id)
    ]);
    const updated = await this.requireOrder(order.id);
    return { order: updated, duplicate: event.status === "succeeded" && order.paymentStatus === "succeeded" };
  }

  override async claimShopNotification(orderId: string): Promise<{ order: Order; claimed: boolean }> {
    const timestamp = nowIso();
    const result = await this.db
      .prepare("UPDATE orders SET status = 'SHOP_NOTIFIED', updated_at = ?1 WHERE id = ?2 AND status = 'PAID'")
      .bind(timestamp, orderId)
      .run();
    return { order: await this.requireOrder(orderId), claimed: result.meta.changes > 0 };
  }

  async addOrderEvent(orderId: string, eventType: string, eventData: unknown): Promise<void> {
    await this.db
      .prepare("INSERT INTO order_events (id, order_id, event_type, event_data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(createId("evt"), orderId, eventType, JSON.stringify(eventData), nowIso())
      .run();
  }

  private async requireOrder(orderId: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    return order;
  }

  private async hydrateOrder(row: OrderRow): Promise<Order> {
    const files = await this.db.prepare("SELECT * FROM order_files WHERE order_id = ?1 ORDER BY created_at").bind(row.id).all<OrderFileRow>();
    return rowToOrder(row, files.results.map(rowToOrderFile));
  }
}

let memoryStore: MemoryTobiStore | null = null;

export function createStore(env?: Partial<Env>): TobiStore {
  if (env?.DB) {
    return new D1TobiStore(env.DB);
  }
  memoryStore ??= new MemoryTobiStore();
  return memoryStore;
}

type CustomerRow = {
  id: string;
  whatsapp_number: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  public_id: string;
  customer_id: string;
  customer_whatsapp_number: string | null;
  shop_id: string;
  status: OrderStatus;
  currency: "INR";
  total_paise: number;
  payment_status: Order["paymentStatus"];
  payment_provider: Order["paymentProvider"];
  payment_id: string | null;
  payment_link_id: string | null;
  payment_link: string | null;
  pickup_code: string | null;
  quote_snapshot_json: string | null;
  print_options_json: string;
  created_at: string;
  updated_at: string;
};

type OrderFileRow = {
  id: string;
  order_id: string;
  original_filename: string | null;
  mime_type: string;
  r2_key: string;
  page_count: number | null;
  file_size_bytes: number | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  customer_id: string | null;
  order_id: string | null;
  direction: Message["direction"];
  provider: Message["provider"];
  processing_status: Message["processingStatus"];
  provider_message_id: string | null;
  body: string | null;
  media_count: number;
  raw_payload_json: string;
  created_at: string;
};

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    whatsappNumber: row.whatsapp_number,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToOrder(row: OrderRow, files: OrderFile[]): Order {
  return {
    id: row.id,
    publicId: row.public_id,
    customerId: row.customer_id,
    customerWhatsappNumber: row.customer_whatsapp_number,
    shopId: row.shop_id,
    status: row.status,
    currency: row.currency,
    totalPaise: row.total_paise,
    paymentStatus: row.payment_status,
    paymentProvider: row.payment_provider,
    paymentId: row.payment_id,
    paymentLinkId: row.payment_link_id,
    paymentLink: row.payment_link,
    pickupCode: row.pickup_code,
    quoteSnapshot: row.quote_snapshot_json ? JSON.parse(row.quote_snapshot_json) : null,
    printOptions: printOptionsSchema.parse(JSON.parse(row.print_options_json)),
    files,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function orderSelectSql(): string {
  return "SELECT orders.*, customers.whatsapp_number AS customer_whatsapp_number FROM orders LEFT JOIN customers ON customers.id = orders.customer_id";
}

function rowToOrderFile(row: OrderFileRow): OrderFile {
  return {
    id: row.id,
    orderId: row.order_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    r2Key: row.r2_key,
    pageCount: row.page_count,
    fileSizeBytes: row.file_size_bytes,
    createdAt: row.created_at
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderId: row.order_id,
    direction: row.direction,
    provider: row.provider,
    processingStatus: row.processing_status,
    providerMessageId: row.provider_message_id,
    body: row.body,
    mediaCount: row.media_count,
    rawPayloadJson: row.raw_payload_json,
    createdAt: row.created_at
  };
}

function paymentRecordId(eventId: string): string {
  return `pay_${eventId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48)}`;
}
