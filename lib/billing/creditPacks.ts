// PLACEHOLDER pricing - not finalized. Confirm real prices with the product
// owner before these packs go live for real charges.
export interface CreditPack {
  key: string;
  credits: number;
  priceCents: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { key: "starter", credits: 100, priceCents: 499, label: "Starter — 100 credits" },
  { key: "popular", credits: 550, priceCents: 1999, label: "Popular — 550 credits" },
  { key: "value", credits: 1200, priceCents: 3999, label: "Value — 1200 credits" },
];

export function getCreditPack(key: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.key === key);
}
