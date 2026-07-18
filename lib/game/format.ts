// Whole-number, comma-grouped display for large monetary/GDP-scale values,
// e.g. formatWithCommas(1234567.89) -> "1,234,568".
export function formatWithCommas(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

// Same comma-grouping, but keeps a few decimal places - for per-second
// rates, which are often well under 1 early game and would otherwise round
// away to "0".
export function formatRateWithCommas(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

// SI-suffixed compact form for small tiles where a full 15-digit number
// won't fit (e.g. Dashboard GDP/Treasury/Credits at trillion+ scale).
// 2.22T, 654.06B, 40, etc. Pair with a title={formatWithCommas(...)} so
// hovering still reveals the exact number.
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export function formatDelta(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString("en-US")}`;
}

// Sector scores are now uncapped integers (0033) - display them
// comma-grouped and floored to whole numbers.
export function formatSectorScore(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.floor(value).toLocaleString("en-US");
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function formatCountdown(msRemaining: number): string {
  return formatDuration(msRemaining / 1000);
}
