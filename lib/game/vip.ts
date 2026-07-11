export function isVipActive(vipExpiresAt: string | null): boolean {
  if (!vipExpiresAt) return false;
  return new Date(vipExpiresAt).getTime() > Date.now();
}

export const VIP_PRICE_CENTS = 799;
export const VIP_MONTHLY_LABEL = "$7.99/mo";
