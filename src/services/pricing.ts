import type { BindingPrice, PricingRule, PrintOptions, QuoteSnapshot } from "../domain";

export const demoPricingRules: PricingRule[] = [
  { paperSize: "A4", colorMode: "black_and_white", sideMode: "single_sided", pricePerPagePaise: 200 },
  { paperSize: "A4", colorMode: "black_and_white", sideMode: "double_sided", pricePerPagePaise: 150 },
  { paperSize: "A4", colorMode: "color", sideMode: "single_sided", pricePerPagePaise: 1000 },
  { paperSize: "A4", colorMode: "color", sideMode: "double_sided", pricePerPagePaise: 800 },
  { paperSize: "A3", colorMode: "black_and_white", sideMode: "single_sided", pricePerPagePaise: 500 },
  { paperSize: "A3", colorMode: "black_and_white", sideMode: "double_sided", pricePerPagePaise: 400 },
  { paperSize: "A3", colorMode: "color", sideMode: "single_sided", pricePerPagePaise: 2000 },
  { paperSize: "A3", colorMode: "color", sideMode: "double_sided", pricePerPagePaise: 1600 }
];

export const demoBindingPrices: BindingPrice[] = [
  { bindingType: "none", pricePaise: 0 },
  { bindingType: "staple", pricePaise: 0 },
  { bindingType: "spiral", pricePaise: 3000 },
  { bindingType: "soft_bind", pricePaise: 6000 },
  { bindingType: "hard_bind", pricePaise: 12000 }
];

export function formatPaise(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(amountPaise % 100 === 0 ? 0 : 2)}`;
}

export function calculateQuote(input: {
  options: PrintOptions;
  pricingRules?: PricingRule[];
  bindingPrices?: BindingPrice[];
}): QuoteSnapshot {
  const options = input.options;
  if (!options.pageCount || !options.copies || !options.colorMode || !options.sideMode) {
    throw new Error("Cannot calculate quote until page count, copies, color mode, and side mode are present");
  }

  const rules = input.pricingRules ?? demoPricingRules;
  const bindingPrices = input.bindingPrices ?? demoBindingPrices;
  const rule = rules.find(
    (candidate) =>
      candidate.paperSize === options.paperSize &&
      candidate.colorMode === options.colorMode &&
      candidate.sideMode === options.sideMode
  );

  if (!rule) {
    throw new Error(`No pricing rule for ${options.paperSize}/${options.colorMode}/${options.sideMode}`);
  }

  const pagesPerSheet = options.pagesPerSheet ?? 1;
  const printedSides = Math.ceil(options.pageCount / pagesPerSheet);
  const billableSheets =
    (options.sideMode === "double_sided" ? Math.ceil(printedSides / 2) : printedSides) * options.copies;
  const printCost = billableSheets * rule.pricePerPagePaise;
  const binding = bindingPrices.find((candidate) => candidate.bindingType === options.bindingType);
  const bindingCost = (binding?.pricePaise ?? 0) * options.copies;
  const platformFee = 200;
  const totalPaise = printCost + bindingCost + platformFee;

  return {
    pages: options.pageCount,
    copies: options.copies,
    pagesPerSheet,
    billableSheets,
    lineItems: [
      { label: "Printing", amountPaise: printCost },
      { label: "Binding", amountPaise: bindingCost },
      { label: "Demo platform fee", amountPaise: platformFee }
    ],
    totalPaise,
    currency: "INR"
  };
}
