import { SECTOR_LABELS } from "@/lib/game/constants";
import { formatDelta, formatDuration } from "@/lib/game/format";
import { computeEffectiveCost } from "@/lib/game/store";
import type { StoreSlot } from "@/lib/types/game";

const TIER_COLOR: Record<number, string> = {
  1: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  2: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200",
  3: "bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-200",
  4: "bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200",
  5: "bg-amber-300 text-amber-950 dark:bg-amber-500 dark:text-black",
};

export function PolicyCard({
  slot,
  gdp,
  onEnact,
  pending,
}: {
  slot: StoreSlot;
  gdp: number;
  onEnact: (slot: StoreSlot) => void;
  pending: boolean;
}) {
  const deltaEntries = Object.entries(slot.statDeltas);
  const effectiveCost = computeEffectiveCost(slot.baseCost, gdp);
  const soldOut = slot.quantity <= 0;
  const lowStock = !soldOut && slot.quantity <= slot.initialQuantity * 0.15;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${TIER_COLOR[slot.tier]}`}>
          Tier {slot.tier}
        </span>
        <span className="text-xs text-zinc-500">{SECTOR_LABELS[slot.primarySector]}</span>
      </div>

      <h3 className="font-semibold">{slot.title}</h3>
      {slot.description && (
        <p className="text-sm text-zinc-500">{slot.description}</p>
      )}

      <ul className="text-sm flex flex-col gap-0.5">
        {deltaEntries.map(([sector, delta]) => (
          <li
            key={sector}
            className={delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          >
            {formatDelta(delta!)} {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS]}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>Cost: {effectiveCost.toFixed(3)}</span>
        <span>{formatDuration(slot.durationSeconds)}</span>
      </div>

      <p className={`text-xs ${soldOut ? "text-red-500" : lowStock ? "text-amber-500" : "text-zinc-500"}`}>
        {soldOut ? "Sold Out" : `${slot.quantity} in stock`}
      </p>

      <button
        type="button"
        onClick={() => onEnact(slot)}
        disabled={pending || soldOut}
        className="rounded-full bg-amber-500 text-black font-medium py-2 disabled:opacity-50"
      >
        {soldOut ? "Sold Out" : "Enact"}
      </button>
    </div>
  );
}
