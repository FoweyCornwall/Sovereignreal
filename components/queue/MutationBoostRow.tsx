"use client";

import { useEffect, useState } from "react";
import { SECTOR_LABELS } from "@/lib/game/constants";
import { formatCountdown } from "@/lib/game/format";
import type { MutationBoost } from "@/lib/types/game";

export function MutationBoostRow({ boost }: { boost: MutationBoost }) {
  const expiresAt = new Date(boost.expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = Math.max(0, expiresAt - now);

  return (
    <div className="mutation-rgb-glow flex flex-col gap-2 rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Mutation Boost</h3>
        <span className="text-xs text-zinc-500">
          {boost.procMultiplier}x proc chance
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums">{formatCountdown(remainingMs)} remaining</span>
      </div>

      <ul className="text-xs flex flex-wrap gap-x-3 gap-y-1">
        {boost.targetSectors.map((sector) => (
          <li key={sector} className="text-zinc-500">
            {SECTOR_LABELS[sector]}
          </li>
        ))}
      </ul>
    </div>
  );
}
