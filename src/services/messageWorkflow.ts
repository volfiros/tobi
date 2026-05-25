import type {
  Customer,
  InboundWhatsAppMessage,
  Message,
  Order,
  PrintOptions,
} from "../domain";
import { calculateQuote, formatPaise } from "./pricing";
import {
  activeOrderSummary,
  confirmationSummary,
  isCancelReply,
  isConfirmReply,
} from "./orderMessages";
import {
  createMessageUnderstandingProvider,
  type MessageUnderstanding,
  type MessageUnderstandingProvider,
} from "./messageUnderstanding";
import { validateUnderstandingSlots } from "./printSlotValidation";
import { storeInboundPdf } from "./pdf";
import { RazorpayPaymentService } from "./razorpay";
import {
  canTransition,
  nextMissingField,
  questionForMissingField,
} from "./stateMachine";
import type { TobiStore } from "../store";

export type WorkflowResult = {
  orderId: string | null;
  reply: string;
  actions?: WorkflowAction[];
  audit: Record<string, unknown>;
};

export type WorkflowAction = {
  id: "confirm_quote" | "cancel_order";
  title: string;
};

export async function handleInboundWorkflow(input: {
  store: TobiStore;
  env: Env;
  customer: Customer;
  inboundMessage: Message;
  inbound: InboundWhatsAppMessage;
  activeOrder: Order | null;
  understandingProvider?: MessageUnderstandingProvider;
  boundOrder?: Order | null;
  skipMediaStorage?: boolean;
}): Promise<WorkflowResult> {
  const inboundHasPdf = input.inbound.media.some((media) =>
    media.contentType.includes("pdf"),
  );
  const understandingProvider =
    input.understandingProvider ??
    createMessageUnderstandingProvider(input.env);
  const understanding = await understandingProvider.understandMessage({
    body: input.inbound.body,
    hasPdf: inboundHasPdf,
    activeOrderSummary: input.activeOrder
      ? activeOrderSummary(input.activeOrder)
      : null,
    recentMessages: await recentOrderMessages(input.store, input.activeOrder),
    media: input.inbound.media.map((media) => ({
      filename: media.filename,
      contentType: media.contentType,
      pageCount: media.pageCount,
      sizeBytes: media.sizeBytes,
    })),
  });

  const quoteReply = await handleQuoteReadyMessage({
    ...input,
    understanding,
    inboundHasPdf,
  });
  if (quoteReply) return quoteReply;

  const paymentStartedReply = await replyForPaymentStartedOrder({
    ...input,
    understanding,
    inboundHasPdf,
  });
  if (paymentStartedReply) return paymentStartedReply;

  const conversationalReply = await replyForNonOrderIntent({
    ...input,
    understanding,
    inboundHasPdf,
  });
  if (conversationalReply) return conversationalReply;

  let order =
    input.boundOrder ??
    (shouldReuseActiveOrder(input.activeOrder, inboundHasPdf, understanding)
      ? input.activeOrder
      : await input.store.createOrder({
          customerId: input.customer.id,
          shopId: input.env.DEMO_SHOP_ID ?? "shop_demo",
        }));
  await input.store.attachMessageToOrder(input.inboundMessage.id, order.id);

  if (!input.skipMediaStorage) {
    for (const [index, media] of input.inbound.media.entries()) {
      if (!media.contentType.includes("pdf")) continue;
      const stored = await storeInboundPdf(
        input.env,
        media.url,
        `orders/${order.id}/upload-${index + 1}.pdf`,
        media.contentType,
      );
      await input.store.addOrderFile({
        orderId: order.id,
        originalFilename: media.filename ?? `upload-${index + 1}.pdf`,
        mimeType: media.contentType,
        r2Key: stored.r2Key,
        pageCount: stored.pageCount ?? media.pageCount,
        fileSizeBytes: media.sizeBytes ?? stored.fileSizeBytes,
      });
    }
  }

  order = (await input.store.getOrder(order.id)) ?? order;
  const contextualUnderstanding = await understandingWithOrderContext({
    store: input.store,
    provider: understandingProvider,
    order,
    currentUnderstanding: understanding,
  });
  const validation = validateUnderstandingSlots({
    confidence: contextualUnderstanding.confidence,
    slots: contextualUnderstanding.slots,
    authoritativePageCount: authoritativePdfPageCount(order),
  });

  if (
    contextualUnderstanding.intent === "unclear" ||
    validation.rejectedReason === "low_confidence"
  ) {
    const reply =
      contextualUnderstanding.ambiguity?.question ??
      "I am not fully sure what to change. Please tell me the PDF print detail again, such as copies, color, sides, or binding.";
    await input.store.addOrderEvent(order.id, "message_understanding_unclear", {
      intent: contextualUnderstanding.intent,
      confidence: contextualUnderstanding.confidence,
      rejectedReason: validation.rejectedReason,
    });
    return {
      orderId: order.id,
      reply,
      audit: workflowAudit(contextualUnderstanding, validation.rejectedReason),
    };
  }

  order = await input.store.updatePrintOptions(order.id, {
    ...validation.accepted,
    fulfillmentType: "pickup",
    pageCount:
      authoritativePdfPageCount(order) ??
      order.printOptions.pageCount ??
      validation.accepted.pageCount,
  });

  if (order.files.length > 0) {
    const defaults = defaultPrintOptionsForUploadedFile(order.printOptions);
    if (Object.keys(defaults).length > 0) {
      order = await input.store.updatePrintOptions(order.id, defaults);
    }
  }

  const missing = nextMissingField({
    hasFile: order.files.length > 0,
    copies: order.printOptions.copies,
    colorMode: order.printOptions.colorMode,
    sideMode: order.printOptions.sideMode,
    pageCount: order.printOptions.pageCount,
  });

  if (missing) {
    await input.store.transitionOrder(
      order.id,
      missing === "file" ? "AWAITING_FILE" : "AWAITING_DETAILS",
    );
    return {
      orderId: order.id,
      reply: questionForMissingField(missing),
      audit: workflowAudit(contextualUnderstanding, validation.rejectedReason, {
        flow: "missing_field",
        missing,
      }),
    };
  }

  const quote = calculateQuote({ options: order.printOptions });
  order = await input.store.setQuote(order.id, quote);
  return {
    orderId: order.id,
    reply: confirmationSummary(order),
    actions: quoteConfirmationActions(),
    audit: workflowAudit(contextualUnderstanding, validation.rejectedReason, {
      flow: "quote_ready",
    }),
  };
}

async function handleQuoteReadyMessage(input: {
  store: TobiStore;
  env: Env;
  activeOrder: Order | null;
  inbound: InboundWhatsAppMessage;
  understanding: MessageUnderstanding;
  inboundHasPdf: boolean;
}): Promise<WorkflowResult | null> {
  const { activeOrder, env, inbound, store, understanding } = input;
  if (!activeOrder || activeOrder.status !== "QUOTE_READY") return null;

  if (understanding.intent === "cancel_order" || isCancelReply(inbound.body)) {
    const cancelled = await store.transitionOrder(activeOrder.id, "CANCELLED");
    await store.addOrderEvent(cancelled.id, "customer_cancelled_quote", {
      channel: "whatsapp",
    });
    return {
      orderId: cancelled.id,
      reply: `Cancelled order ${cancelled.publicId}.`,
      audit: workflowAudit(understanding, null, {
        flow: "quote_cancelled",
      }),
    };
  }

  if (understanding.intent === "confirm_quote" || isConfirmReply(inbound.body)) {
    const payment = await new RazorpayPaymentService(env).createPaymentRequest(
      activeOrder,
    );
    const order = await store.setPaymentRequest(activeOrder.id, payment);
    return {
      orderId: order.id,
      reply: [
        `Confirmed ${order.publicId}.`,
        `Total: ${formatPaise(order.totalPaise)}`,
        `Pay here: ${payment.paymentLink}`,
      ].join("\n"),
      audit: workflowAudit(understanding, null, {
        flow: "payment_link_sent",
      }),
    };
  }

  const bindingOverride = bindingTypeFromUserText(inbound.body);
  const validation = validateUnderstandingSlots({
    confidence: understanding.confidence,
    slots: {
      ...understanding.slots,
      ...(bindingOverride ? { bindingType: bindingOverride } : {}),
    },
    authoritativePageCount: authoritativePdfPageCount(activeOrder),
  });
  if (Object.keys(validation.accepted).length > 0) {
    const updated = await store.updatePrintOptions(
      activeOrder.id,
      validation.accepted,
    );
    const quote = calculateQuote({ options: updated.printOptions });
    const requoted = await store.setQuote(updated.id, quote);
    return {
      orderId: requoted.id,
      reply: confirmationSummary(requoted),
      actions: quoteConfirmationActions(),
      audit: workflowAudit(understanding, validation.rejectedReason, {
        flow: "quote_recalculated",
      }),
    };
  }

  return {
    orderId: activeOrder.id,
    reply: [
      "Please confirm, cancel, or change this quote before starting another order.",
      confirmationSummary(activeOrder),
    ].join("\n\n"),
    actions: quoteConfirmationActions(),
    audit: workflowAudit(understanding, validation.rejectedReason, {
      flow: "quote_waiting_confirmation",
    }),
  };
}

async function replyForNonOrderIntent(input: {
  store: TobiStore;
  activeOrder: Order | null;
  inbound: InboundWhatsAppMessage;
  understanding: MessageUnderstanding;
  inboundHasPdf: boolean;
}): Promise<WorkflowResult | null> {
  const { activeOrder, inbound, inboundHasPdf, store, understanding } = input;
  if (inboundHasPdf) return null;

  if (understanding.intent === "ask_current_file") {
    const reply = activeOrder?.files.length
      ? currentFileReply(activeOrder)
      : "I do not have a PDF for this order yet. Please send the PDF file you want printed.";
    return {
      orderId: activeOrder?.id ?? null,
      reply,
      actions:
        activeOrder && canTransition(activeOrder.status, "CANCELLED")
          ? cancelOrderActions()
          : undefined,
      audit: workflowAudit(understanding, null, {
        flow: "current_file_question",
      }),
    };
  }

  if (understanding.intent === "ask_order_status") {
    const reply = activeOrder
      ? [
          `Your active order is ${activeOrder.publicId}.`,
          `Order status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`,
          `Payment status: ${activeOrder.paymentStatus.replaceAll("_", " ")}.`,
        ].join("\n")
      : "I can check that. Please share your Tobi order ID, or send details from the same WhatsApp number used for the order.";
    return {
      orderId: activeOrder?.id ?? null,
      reply,
      audit: workflowAudit(understanding, null, { flow: "status_reply" }),
    };
  }

  if (understanding.intent === "payment_help") {
    const reply = activeOrder
      ? [
          `For ${activeOrder.publicId}, payment status is ${activeOrder.paymentStatus.replaceAll("_", " ")}.`,
          activeOrder.paymentLink
            ? `Payment link: ${activeOrder.paymentLink}`
            : "I do not have a payment link for this order yet.",
        ].join("\n")
      : "I can help with payment. If you already have an order, send the order ID or describe what happened with the payment link.";
    return {
      orderId: activeOrder?.id ?? null,
      reply,
      audit: workflowAudit(understanding, null, { flow: "payment_help" }),
    };
  }

  if (understanding.intent === "cancel_order") {
    if (!activeOrder) {
      return {
        orderId: null,
        reply: "I do not see an active order to cancel.",
        audit: workflowAudit(understanding, null, {
          flow: "cancel_without_order",
        }),
      };
    }
    if (!canTransition(activeOrder.status, "CANCELLED")) {
      return {
        orderId: activeOrder.id,
        reply: `I cannot cancel ${activeOrder.publicId} from its current status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`,
        audit: workflowAudit(understanding, null, { flow: "cancel_blocked" }),
      };
    }
    const cancelled = await store.transitionOrder(activeOrder.id, "CANCELLED");
    await store.addOrderEvent(cancelled.id, "customer_cancelled_order", {
      channel: "whatsapp",
    });
    return {
      orderId: cancelled.id,
      reply: `Cancelled order ${cancelled.publicId}.`,
      audit: workflowAudit(understanding, null, { flow: "cancelled" }),
    };
  }

  if (understanding.intent === "human_support") {
    return {
      orderId: activeOrder?.id ?? null,
      reply: activeOrder
        ? `I can help here. Tell me what went wrong with ${activeOrder.publicId}, or ask the shop team from the dashboard.`
        : "I can help here. Tell me what went wrong, or send a PDF if this is for a print order.",
      audit: workflowAudit(understanding, null, { flow: "human_support" }),
    };
  }

  if (understanding.intent === "ask_quote" && !activeOrder) {
    return {
      orderId: null,
      reply:
        "I can prepare a quote after I know the PDF and print options. Send the PDF first, then tell me copies, color or black and white, single or double-sided, binding, and pickup time.",
      audit: workflowAudit(understanding, null, {
        flow: "quote_without_order",
      }),
    };
  }

  if (understanding.intent === "general_chat") {
    return {
      orderId: activeOrder?.id ?? null,
      reply: generalChatReply(inbound.body),
      audit: workflowAudit(understanding, null, { flow: "general_chat" }),
    };
  }

  return null;
}

async function replyForPaymentStartedOrder(input: {
  store: TobiStore;
  activeOrder: Order | null;
  inbound: InboundWhatsAppMessage;
  understanding: MessageUnderstanding;
  inboundHasPdf: boolean;
}): Promise<WorkflowResult | null> {
  const { activeOrder, inbound, inboundHasPdf, store, understanding } = input;
  if (!activeOrder || !isPaidOrPaymentStarted(activeOrder)) return null;

  if (understanding.intent === "cancel_order") {
    if (!canTransition(activeOrder.status, "CANCELLED")) {
      return {
        orderId: activeOrder.id,
        reply: `I cannot cancel ${activeOrder.publicId} from its current status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`,
        audit: workflowAudit(understanding, null, {
          flow: "payment_started_cancel_blocked",
        }),
      };
    }
    const cancelled = await store.transitionOrder(activeOrder.id, "CANCELLED");
    await store.addOrderEvent(cancelled.id, "customer_cancelled_order", {
      channel: "whatsapp",
    });
    return {
      orderId: cancelled.id,
      reply: `Cancelled order ${cancelled.publicId}.`,
      audit: workflowAudit(understanding, null, {
        flow: "payment_started_cancelled",
      }),
    };
  }

  if (understanding.intent === "ask_order_status") {
    return {
      orderId: activeOrder.id,
      reply: [
        `Your active order is ${activeOrder.publicId}.`,
        `Order status: ${activeOrder.status.replaceAll("_", " ").toLowerCase()}.`,
        `Payment status: ${activeOrder.paymentStatus.replaceAll("_", " ")}.`,
      ].join("\n"),
      audit: workflowAudit(understanding, null, {
        flow: "payment_started_status_reply",
      }),
    };
  }

  if (
    understanding.intent === "payment_help" ||
    understanding.intent === "confirm_quote" ||
    understanding.intent === "ask_quote" ||
    understanding.intent === "start_print_order" ||
    understanding.intent === "update_order_details" ||
    inboundHasPdf
  ) {
    const validation = validateUnderstandingSlots({
      confidence: understanding.confidence,
      slots: understanding.slots,
      authoritativePageCount: authoritativePdfPageCount(activeOrder),
    });
    return {
      orderId: activeOrder.id,
      reply: paymentStartedOrderReply(activeOrder),
      actions: canTransition(activeOrder.status, "CANCELLED")
        ? cancelOrderActions()
        : undefined,
      audit: workflowAudit(understanding, validation.rejectedReason, {
        flow:
          Object.keys(validation.accepted).length > 0
            ? "post_payment_edit_blocked"
            : "payment_started_closed_flow",
      }),
    };
  }

  if (understanding.intent === "human_support") {
    return {
      orderId: activeOrder.id,
      reply: `I can help here. Tell me what went wrong with ${activeOrder.publicId}, or contact the shop team for help.`,
      audit: workflowAudit(understanding, null, {
        flow: "payment_started_human_support",
      }),
    };
  }

  if (understanding.intent === "general_chat") {
    return {
      orderId: activeOrder.id,
      reply: generalChatReply(inbound.body),
      audit: workflowAudit(understanding, null, {
        flow: "payment_started_general_chat",
      }),
    };
  }

  return null;
}

async function understandingWithOrderContext(input: {
  store: TobiStore;
  provider: MessageUnderstandingProvider;
  order: Order;
  currentUnderstanding: MessageUnderstanding;
}): Promise<MessageUnderstanding> {
  const messages = await input.store.listInboundMessagesForOrder(
    input.order.id,
  );
  const recentMessages = messages
    .map((message) => message.body?.trim())
    .filter((body): body is string => Boolean(body));
  const combinedBody = recentMessages.join("\n");
  if (!combinedBody || !hasPrintInstructionDetails(combinedBody)) {
    return input.currentUnderstanding;
  }

  const contextual = await input.provider.understandMessage({
    body: combinedBody,
    hasPdf: input.order.files.length > 0,
    activeOrderSummary: activeOrderSummary(input.order),
    recentMessages,
    media: input.order.files.map((file) => ({
      filename: file.originalFilename,
      contentType: file.mimeType,
      pageCount: file.pageCount,
      sizeBytes: file.fileSizeBytes,
    })),
  });
  return {
    ...input.currentUnderstanding,
    intent:
      input.currentUnderstanding.intent === "start_print_order" ||
      input.currentUnderstanding.intent === "update_order_details"
        ? input.currentUnderstanding.intent
        : contextual.intent,
    confidence: Math.max(
      input.currentUnderstanding.confidence,
      contextual.confidence,
    ),
    slots: {
      ...contextual.slots,
      ...input.currentUnderstanding.slots,
    },
    ambiguity: input.currentUnderstanding.ambiguity ?? contextual.ambiguity,
    customerReplyDraft:
      input.currentUnderstanding.customerReplyDraft ??
      contextual.customerReplyDraft,
  };
}

function shouldReuseActiveOrder(
  order: Order | null,
  inboundHasPdf: boolean,
  understanding: MessageUnderstanding,
): order is Order {
  if (!order) return false;
  if (isPaidOrPaymentStarted(order) || order.status === "QUOTE_READY") {
    return false;
  }
  if (
    !inboundHasPdf &&
    order.files.length > 0 &&
    understanding.intent === "start_print_order"
  ) {
    return false;
  }
  if (!inboundHasPdf) return true;
  return order.status === "AWAITING_FILE" && order.files.length === 0;
}

function isPaidOrPaymentStarted(order: Order): boolean {
  return [
    "PAYMENT_LINK_SENT",
    "PAYMENT_PENDING",
    "PAID",
    "SHOP_NOTIFIED",
    "ACCEPTED",
    "PRINTING",
    "READY_FOR_PICKUP",
  ].includes(order.status);
}

function currentFileReply(order: Order): string {
  const files = order.files
    .map((file) => {
      const name = file.originalFilename ?? "uploaded PDF";
      const pages = file.pageCount ? `, ${file.pageCount} pages` : "";
      return `${name}${pages}`;
    })
    .join("; ");
  return [
    `I am currently using order ${order.publicId}: ${files}.`,
    "Send the remaining print details for this file, or cancel this order and send a different PDF.",
  ].join("\n");
}

function generalChatReply(body: string): string {
  const normalized = body.toLowerCase();
  if (
    /\b(do you know about me|who am i|what do you know about me|know me)\b/.test(
      normalized,
    )
  ) {
    return "I only know what you share in this chat and any active print-order details linked to this WhatsApp number. I do not know personal details about you unless you tell me.";
  }
  if (/^(hi|hello|hey|namaste|yo)\b[!. ]*$/.test(normalized.trim())) {
    return "Hi. I can help with PDF print orders, quotes, payment links, order status, and pickup. What would you like to print today?";
  }
  return "I can help with PDF print orders, quotes, payment links, order status, and pickup. Send a PDF or tell me the print details.";
}

function paymentStartedOrderReply(order: Order): string {
  return [
    `Order ${order.publicId} already has payment status ${order.paymentStatus.replaceAll("_", " ")}.`,
    order.paymentLink
      ? `Payment link: ${order.paymentLink}`
      : "I do not have a payment link for this order yet.",
    "I cannot automatically change print details after payment has started. Cancel this order if cancellation is still allowed, or contact the shop team for help.",
  ].join("\n");
}

function authoritativePdfPageCount(order: Order): number | null {
  return order.files.find((file) => file.pageCount !== null)?.pageCount ?? null;
}

function defaultPrintOptionsForUploadedFile(
  options: PrintOptions,
): Partial<PrintOptions> {
  return {
    ...(options.copies ? {} : { copies: 1 }),
    ...(options.colorMode ? {} : { colorMode: "black_and_white" }),
    ...(options.sideMode ? {} : { sideMode: "single_sided" }),
    ...(options.paperSize ? {} : { paperSize: "A4" }),
    ...(options.bindingType ? {} : { bindingType: "staple" }),
    ...(options.pagesPerSheet ? {} : { pagesPerSheet: 1 }),
  };
}

function quoteConfirmationActions(): WorkflowAction[] {
  return [
    { id: "confirm_quote", title: "Confirm" },
    { id: "cancel_order", title: "Cancel" },
  ];
}

function cancelOrderActions(): WorkflowAction[] {
  return [{ id: "cancel_order", title: "Cancel" }];
}

function hasPrintInstructionDetails(body: string): boolean {
  const normalized = body.toLowerCase();
  return /\b(copy|copies|sets?|bw|b\/w|black|black and white|b&w|colou?r|double|duplex|both sides?|both side|two[- ]sided|2[- ]sided|single|single side|one[- ]sided|1[- ]sided|spiral|staple|soft bind|hard bind|no binding|pickup|at \d{1,2}|by \d{1,2}|[2468][- ]?up|[2468]\s+pages?\s+(?:on|onto|per|in|into|fit|fitted|printed))\b/.test(
    normalized,
  );
}

function bindingTypeFromUserText(
  body: string,
): MessageUnderstanding["slots"]["bindingType"] | null {
  const normalized = body.toLowerCase();
  if (/\bspiral\b/.test(normalized)) return "spiral";
  if (/\bstaple|stapling\b/.test(normalized)) return "staple";
  if (/\b(no|without)\s+(?:spiral|binding|bind)\b|\bno binding\b|\bnone\b/.test(normalized)) {
    return "staple";
  }
  if (/\b(bind|binding)\b/.test(normalized)) return "spiral";
  return null;
}

async function recentOrderMessages(
  store: TobiStore,
  order: Order | null,
): Promise<string[]> {
  if (!order) return [];
  const messages = await store.listInboundMessagesForOrder(order.id);
  return messages
    .map((message) => message.body?.trim())
    .filter((body): body is string => Boolean(body))
    .slice(-8);
}

function workflowAudit(
  understanding: MessageUnderstanding,
  rejectedReason: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    intent: understanding.intent,
    confidence: understanding.confidence,
    slots: understanding.slots,
    ambiguity: understanding.ambiguity,
    rejectedReason,
    ...extra,
  };
}
