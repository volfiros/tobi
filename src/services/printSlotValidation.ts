import { printOptionsSchema, type PrintOptions } from "../domain";
import type { MessageUnderstanding } from "./messageUnderstanding";

export type SlotValidationResult = {
  accepted: Partial<PrintOptions>;
  rejectedReason: string | null;
};

export function validateUnderstandingSlots(input: {
  confidence: number;
  slots: MessageUnderstanding["slots"];
  authoritativePageCount: number | null;
}): SlotValidationResult {
  if (input.confidence < 0.7) {
    return { accepted: {}, rejectedReason: "low_confidence" };
  }

  const accepted: Partial<PrintOptions> = {};
  let rejectedReason: string | null = null;
  const slots = input.slots ?? {};

  if (slots.copies != null) accepted.copies = parseSlot({ copies: slots.copies }).copies;
  if (slots.colorMode != null) accepted.colorMode = parseSlot({ colorMode: slots.colorMode }).colorMode;
  if (slots.sideMode != null) accepted.sideMode = parseSlot({ sideMode: slots.sideMode }).sideMode;
  if (slots.paperSize != null) accepted.paperSize = parseSlot({ paperSize: slots.paperSize }).paperSize;
  if (slots.bindingType != null) accepted.bindingType = parseSlot({ bindingType: slots.bindingType }).bindingType;
  if (slots.pagesPerSheet != null) accepted.pagesPerSheet = parseSlot({ pagesPerSheet: slots.pagesPerSheet }).pagesPerSheet;
  if (slots.fulfillmentType != null) accepted.fulfillmentType = parseSlot({ fulfillmentType: slots.fulfillmentType }).fulfillmentType;
  if (slots.pickupTime != null) accepted.pickupTime = parseSlot({ pickupTime: slots.pickupTime }).pickupTime;
  if (slots.specialInstructions != null) {
    accepted.specialInstructions = parseSlot({ specialInstructions: slots.specialInstructions }).specialInstructions;
  }

  if (slots.pageCount != null) {
    if (input.authoritativePageCount) {
      rejectedReason = "ignored_ai_page_count";
    } else {
      accepted.pageCount = parseSlot({ pageCount: slots.pageCount }).pageCount;
    }
  }

  return { accepted, rejectedReason };
}

function parseSlot<T extends Partial<PrintOptions>>(slot: T): T {
  return printOptionsSchema.partial().parse(slot) as T;
}
