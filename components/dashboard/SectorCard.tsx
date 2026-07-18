import { memo } from "react";
import { SECTOR_LABELS } from "@/lib/game/constants";
import { computeTrend } from "@/lib/game/gdp";
import { formatSectorScore } from "@/lib/game/format";
import { MUTATION_RARITIES_INFO, getRarityInfo } from "@/lib/game/mutations";
import { MutationBadge } from "@/components/dashboard/MutationBadge";
import type { SectorMutation, SectorState } from "@/lib/types/game";
import type { SectorTheme } from "@/lib/game/cosmetics";

const TREND_ARROW: Record<ReturnType<typeof computeTrend>, string> = {
  up: "▲",
  down: "▼",
  flat: "▬",
};

const TREND_COLOR: Record<ReturnType<typeof computeTrend>, string> = {
  up: "text-emerald-500",
  down: "text-red-500",
  flat: "text-zinc-400",
};

const LEGENDARY_AND_ABOVE_INDEX = MUTATION_RARITIES_INFO.findIndex(
  (r) => r.rarity === "legendary"
);
const EPIC_AND_ABOVE_INDEX = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === "epic");
const MYTHIC_AND_ABOVE_INDEX = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === "mythic");

function SectorCardImpl({
  state,
  mutation,
  equippedTheme,
}: {
  state: SectorState;
  mutation?: SectorMutation;
  equippedTheme?: SectorTheme | null;
}) {
  const trend = computeTrend(state);

  if (!mutation) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm px-3 py-2.5">
        <span className="text-sm font-medium truncate">{SECTOR_LABELS[state.sector]}</span>
        <div className="flex items-center justify-between">
          <span className="tabular-nums text-sm">{formatSectorScore(state.score)}</span>
          <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
        </div>
      </div>
    );
  }

  const info = getRarityInfo(mutation.rarity);
  const rarityIndex = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === mutation.rarity);
  const isVibrant = rarityIndex >= LEGENDARY_AND_ABOVE_INDEX;
  const isIridescent = info.color === "iridescent";

  if (equippedTheme) {
    const band =
      rarityIndex >= MYTHIC_AND_ABOVE_INDEX
        ? "high"
        : rarityIndex >= EPIC_AND_ABOVE_INDEX
          ? "mid"
          : "low";
    return (
      <div
        className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2.5 transition-shadow theme-${equippedTheme}-${band}`}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-semibold truncate flex-1 min-w-0">
            {SECTOR_LABELS[state.sector]}
          </span>
          <MutationBadge mutation={mutation} />
        </div>
        <div className="flex items-center justify-between">
          <span className="tabular-nums text-sm font-semibold">{formatSectorScore(state.score)}</span>
          <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border-2 px-3 py-2.5 transition-shadow ${
        isVibrant ? "mutation-rgb-glow" : ""
      }`}
      style={{
        borderColor: isIridescent ? "transparent" : info.color,
        backgroundColor: isIridescent
          ? undefined
          : `color-mix(in srgb, ${info.color} ${isVibrant ? "20%" : "8%"}, transparent)`,
        backgroundImage: isIridescent
          ? "linear-gradient(120deg, #ff9a9e33, #a18cd133, #8fd3f433)"
          : undefined,
        boxShadow: isVibrant
          ? `0 0 16px 0 color-mix(in srgb, ${isIridescent ? "#a18cd1" : info.color} 33%, transparent)`
          : undefined,
      }}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-sm font-semibold truncate flex-1 min-w-0">{SECTOR_LABELS[state.sector]}</span>
        <MutationBadge mutation={mutation} />
      </div>
      <div className="flex items-center justify-between">
        <span className="tabular-nums text-sm font-semibold">{formatSectorScore(state.score)}</span>
        <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
      </div>
    </div>
  );
}

// Memoized: the Dashboard re-renders the whole sector grid on every
// polling tick + on every action's router.refresh(). Without memo, all
// 10 cards + their mutation gradients repaint even when nothing in their
// props changed. Referential-equality on state/mutation is enough here
// since loadGameState builds fresh objects only on real changes.
export const SectorCard = memo(SectorCardImpl);
