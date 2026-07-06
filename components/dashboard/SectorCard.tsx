import { SECTOR_LABELS } from "@/lib/game/constants";
import { computeTrend } from "@/lib/game/gdp";
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

export function SectorCard({
  state,
  mutation,
}: {
  state: SectorState;
  mutation?: SectorMutation;
}) {
  const trend = computeTrend(state);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{SECTOR_LABELS[state.sector]}</span>
        {mutation && <MutationBadge mutation={mutation} />}
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-sm">{state.score.toFixed(3)}</span>
        <span className={`${TREND_COLOR[trend]} text-xs`}>{TREND_ARROW[trend]}</span>
      </div>
    </div>
  );
}
