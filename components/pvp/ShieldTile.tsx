"use client";

import { SECTOR_LABELS, type Sector } from "@/lib/game/constants";
import { MUTATION_RARITIES_INFO, getRarityInfoByMultiplier } from "@/lib/game/mutations";

const LEGENDARY_INDEX = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === "legendary");
const EPIC_INDEX = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === "epic");
const MYTHIC_INDEX = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === "mythic");

export function ShieldTile({
  sector,
  currentScore,
  mutationMultiplier,
  targetable,
  onAttack,
  flashOutcome,
  flashKey,
}: {
  sector: Sector;
  currentScore: number;
  mutationMultiplier: number | null;
  targetable: boolean;
  onAttack?: (sector: Sector) => void;
  flashOutcome?: "hit" | "miss" | null;
  flashKey: number;
}) {
  const isBroken = currentScore <= 0;
  const rarity = mutationMultiplier != null ? getRarityInfoByMultiplier(mutationMultiplier) : undefined;
  const rarityIndex = rarity ? MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === rarity.rarity) : -1;
  const isVibrant = rarityIndex >= LEGENDARY_INDEX;
  const isIridescent = rarity?.color === "iridescent";
  const band = rarityIndex >= MYTHIC_INDEX ? "high" : rarityIndex >= EPIC_INDEX ? "mid" : "low";

  return (
    <button
      type="button"
      disabled={!targetable || isBroken}
      onClick={() => onAttack?.(sector)}
      className={`relative flex flex-col gap-1 rounded-full border-2 px-2 py-2.5 text-center transition-transform ${
        targetable && !isBroken ? "cursor-pointer hover:scale-105" : "cursor-default"
      } ${isBroken ? "opacity-40" : ""} ${isVibrant ? "mutation-rgb-glow" : ""}`}
      style={{
        borderColor: isBroken ? "#71717a" : isIridescent ? "transparent" : rarity?.color ?? "#71717a",
        backgroundImage: isIridescent
          ? "linear-gradient(120deg, #ff9a9e33, #a18cd133, #8fd3f433)"
          : undefined,
      }}
      data-band={rarity ? band : undefined}
    >
      {flashOutcome && (
        <span
          key={flashKey}
          className={
            flashOutcome === "hit"
              ? "siege-shield-hit pointer-events-none absolute inset-0 rounded-full"
              : "siege-shield-miss pointer-events-none absolute inset-0 rounded-full"
          }
        />
      )}
      <span className="text-[10px] font-medium truncate">{SECTOR_LABELS[sector]}</span>
      <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${Math.max(0, currentScore)}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-zinc-500">{Math.round(currentScore)}</span>
      {isBroken && <span className="absolute inset-0 flex items-center justify-center text-lg">💥</span>}
    </button>
  );
}
