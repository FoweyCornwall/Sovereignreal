"use client";

import { SECTOR_LABELS, type Sector } from "@/lib/game/constants";

export type TileStatus = "unused" | "selectable" | "pending-mine" | "revealed";
export type TileOutcome = "won" | "lost" | "no-point";

export function ShieldTile({
  sector,
  status,
  myScore,
  opponentScore,
  outcome,
  flashKey,
  onSelect,
}: {
  sector: Sector;
  status: TileStatus;
  myScore: number | null;
  opponentScore: number | null;
  outcome: TileOutcome | null;
  flashKey: number;
  onSelect?: () => void;
}) {
  if (status === "selectable") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-col items-center gap-1 rounded-full border-2 border-dashed border-brand-500 px-2 py-2.5 text-center cursor-pointer hover:bg-brand-500/10 active:scale-95 transition"
      >
        <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
        <span className="text-lg">❔</span>
      </button>
    );
  }

  if (status === "pending-mine") {
    return (
      <div className="pvp-pending-pulse flex flex-col items-center gap-1 rounded-full border-2 border-brand-500 px-2 py-2.5 text-center">
        <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
        <span className="text-lg">🔒</span>
      </div>
    );
  }

  if (status === "unused") {
    return (
      <div className="flex flex-col items-center gap-1 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-2.5 text-center opacity-70">
        <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
        <span className="text-lg">❔</span>
      </div>
    );
  }

  const borderClass =
    outcome === "won"
      ? "border-emerald-500 bg-emerald-500/10"
      : outcome === "lost"
        ? "border-red-500 bg-red-500/10"
        : "border-zinc-400 bg-zinc-400/10 dark:border-zinc-600";
  const labelClass =
    outcome === "won" ? "text-emerald-500" : outcome === "lost" ? "text-red-500" : "text-zinc-500";
  const labelText = outcome === "won" ? "Won" : outcome === "lost" ? "Lost" : "No point";

  return (
    <div
      key={flashKey}
      className={`siege-reveal-pop relative flex flex-col items-center gap-1 rounded-full border-2 px-2 py-2.5 text-center ${borderClass}`}
    >
      <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
      <span className="text-xs tabular-nums font-semibold">
        {myScore !== null ? Math.floor(myScore) : null} <span className="text-zinc-400">vs</span> {opponentScore !== null ? Math.floor(opponentScore) : null}
      </span>
      <span className={`text-[10px] font-medium ${labelClass}`}>{labelText}</span>
    </div>
  );
}
