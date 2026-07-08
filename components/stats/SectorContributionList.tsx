import { SECTOR_LABELS } from "@/lib/game/constants";
import { computeSectorContributions } from "@/lib/game/gdp";
import type { SectorState } from "@/lib/types/game";

export function SectorContributionList({ sectors }: { sectors: SectorState[] }) {
  const contributions = computeSectorContributions(sectors).sort(
    (a, b) => b.contribution - a.contribution
  );

  return (
    <div className="flex flex-col gap-2">
      {contributions.map((c) => (
        <div key={c.sector} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0">{SECTOR_LABELS[c.sector]}</span>
          <div className="flex-1 h-2 rounded-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
            <div
              className="h-full bg-brand-500"
              style={{ width: `${Math.min(100, c.sharePercent)}%` }}
            />
          </div>
          <span className="w-14 text-right tabular-nums text-zinc-500">
            {c.sharePercent.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
