import { SECTOR_LABELS } from "@/lib/game/constants";
import { formatDelta } from "@/lib/game/format";
import type { PolicyHistoryEntry } from "@/lib/types/game";

export function PolicyHistoryList({ entries }: { entries: PolicyHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">No policies have settled yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900/40 dark:backdrop-blur-md p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{entry.title}</span>
            <span className="text-xs text-zinc-500">
              {new Date(entry.settledAt).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
            {Object.entries(entry.statDeltas).map(([sector, delta]) => (
              <span
                key={sector}
                className={delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
              >
                {formatDelta(delta!)} {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS]}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
