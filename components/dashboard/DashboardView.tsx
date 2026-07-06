"use client";

import { useTickingValue } from "@/components/dashboard/useTickingValue";
import { usePollingRefresh } from "@/components/usePollingRefresh";
import { SectorCard } from "@/components/dashboard/SectorCard";
import { formatSigFigs } from "@/lib/game/format";
import type { Country, SectorState } from "@/lib/types/game";

export function DashboardView({
  country,
  sectors,
}: {
  country: Country;
  sectors: SectorState[];
}) {
  usePollingRefresh();

  const gdp = useTickingValue(country.gdp, country.gdpPerSec);
  const treasury = useTickingValue(country.treasury, country.treasuryRegenPerSec);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl"
          style={{ backgroundColor: country.flagStyle?.bg }}
        >
          {country.flagEmoji ?? "🏳️"}
        </span>
        <div>
          <h1 className="text-xl font-semibold">{country.name}</h1>
          <p className="text-sm text-zinc-500">Gross Domestic Product</p>
        </div>
      </header>

      <div className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-950 p-5">
        <p className="text-3xl font-bold tabular-nums">{formatSigFigs(gdp, 5)}</p>
        <p className="text-sm text-zinc-400">
          {country.gdpPerSec >= 0 ? "+" : ""}
          {country.gdpPerSec.toFixed(4)} / sec
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Treasury</p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatSigFigs(treasury, 5)}
        </p>
        <p className="text-sm text-zinc-500">
          +{country.treasuryRegenPerSec.toFixed(4)} / sec
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Sectors
        </h2>
        <div className="flex flex-col gap-2">
          {sectors.map((s) => (
            <SectorCard key={s.sector} state={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
