export function isVipActive(vipExpiresAt: string | null): boolean {
  if (!vipExpiresAt) return false;
  return new Date(vipExpiresAt).getTime() > Date.now();
}

// Lifetime VIP sets vip_expires_at to a far-future date; anything past
// year 2900 is treated as effectively forever.
export function isLifetimeVip(vipExpiresAt: string | null): boolean {
  if (!vipExpiresAt) return false;
  return new Date(vipExpiresAt).getUTCFullYear() >= 2900;
}

export const VIP_LIFETIME_EXPIRY_ISO = "2999-12-31T00:00:00Z";

export const VIP_PRICE_CENTS = 799;
export const VIP_MONTHLY_LABEL = "$7.99/mo";

export const VIP_LIFETIME_PRICE_CENTS = 1599;
export const VIP_LIFETIME_LABEL = "$15.99 lifetime";
