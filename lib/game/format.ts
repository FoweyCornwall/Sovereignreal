// Formats a non-negative number to a fixed number of significant figures,
// e.g. formatSigFigs(1234.5, 5) -> "1234.5", formatSigFigs(0, 5) -> "0.0000".
export function formatSigFigs(value: number, sigFigs = 5): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return (0).toFixed(sigFigs - 1);

  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(sigFigs - magnitude - 1, 0);
  return value.toFixed(decimals);
}

export function formatDelta(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
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
