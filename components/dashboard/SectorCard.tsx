import { SECTOR_LABELS } from "@/lib/game/constants";
import { computeTrend } from "@/lib/game/gdp";
import { MUTATION_RARITIES_INFO, getRarityInfo } from "@/lib/game/mutations";
import { MutationBadge } from "@/components/dashboard/MutationBadge";
import type { SectorMutation, SectorState } from "@/lib/types/game";

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

export function SectorCard({
  state,
  mutation,
}: {
  state: SectorState;
  mutation?: SectorMutation;
}) {
  const trend = computeTrend(state);

  if (!mutation) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/40 dark:backdrop-blur-md px-4 py-3">
        <span className="text-sm font-medium">{SECTOR_LABELS[state.sector]}</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-sm">{state.score.toFixed(3)}</span>
          <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
        </div>
      </div>
    );
  }

  const info = getRarityInfo(mutation.rarity);
  const rarityIndex = MUTATION_RARITIES_INFO.findIndex((r) => r.rarity === mutation.rarity);
  const isVibrant = rarityIndex >= LEGENDARY_AND_ABOVE_INDEX;
  const isIridescent = info.color === "iridescent";

  return (
    <div
      className="flex items-center justify-between rounded-2xl border-2 px-4 py-3 transition-shadow"
      style={{
        borderColor: isIridescent ? "transparent" : info.color,
        backgroundColor: isIridescent
          ? undefined
          : `${info.color}${isVibrant ? "33" : "14"}`,
        backgroundImage: isIridescent
          ? "linear-gradient(120deg, #ff9a9e33, #a18cd133, #8fd3f433)"
          : undefined,
        boxShadow: isVibrant ? `0 0 16px 0 ${isIridescent ? "#a18cd1" : info.color}55` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{SECTOR_LABELS[state.sector]}</span>
        <MutationBadge mutation={mutation} />
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-sm font-semibold">{state.score.toFixed(3)}</span>
        <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
      </div>
    </div>
  );
}
