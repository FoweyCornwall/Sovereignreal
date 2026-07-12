"use client";

import { SECTOR_LABELS, type Sector } from "@/lib/game/constants";

export function ShieldTile({
  sector,
  revealed,
  myScore,
  opponentScore,
  iWon,
  flashKey,
  selectable,
  onSelect,
}: {
  sector: Sector;
  revealed: boolean;
  myScore: number | null;
  opponentScore: number | null;
  iWon: boolean | null;
  flashKey: number;
  selectable?: boolean;
  onSelect?: () => void;
}) {
  if (!revealed) {
    if (selectable) {
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
    return (
      <div className="flex flex-col items-center gap-1 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 px-2 py-2.5 text-center opacity-70">
        <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
        <span className="text-lg">❔</span>
      </div>
    );
  }

  return (
    <div
      key={flashKey}
      className={`siege-reveal-pop relative flex flex-col items-center gap-1 rounded-full border-2 px-2 py-2.5 text-center ${
        iWon
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-red-500 bg-red-500/10"
      }`}
    >
      <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
      <span className="text-xs tabular-nums font-semibold">
        {myScore?.toFixed(1)} <span className="text-zinc-400">vs</span> {opponentScore?.toFixed(1)}
      </span>
      <span className={`text-[10px] font-medium ${iWon ? "text-emerald-500" : "text-red-500"}`}>
        {iWon ? "Won" : "Lost"}
      </span>
    </div>
  );
}
