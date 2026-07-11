"use client";

import { useTickingValue } from "@/components/dashboard/useTickingValue";
import { usePollingRefresh } from "@/components/usePollingRefresh";
import { SectorCard } from "@/components/dashboard/SectorCard";
import { RankBadge } from "@/components/dashboard/RankBadge";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { DailyRewardChip } from "@/components/dashboard/DailyRewardChip";
import { VipBadge } from "@/components/ui/VipBadge";
import { formatRateWithCommas, formatWithCommas } from "@/lib/game/format";
import { isVipActive } from "@/lib/game/vip";
import type { Country, SectorMutation, SectorState } from "@/lib/types/game";
import type { SectorTheme } from "@/lib/game/cosmetics";

export function DashboardView({
  country,
  sectors,
  mutations,
  credits,
  lastDailyClaimAt,
  equippedSectorTheme,
  vipExpiresAt,
}: {
  country: Country;
  sectors: SectorState[];
  mutations: SectorMutation[];
  credits: number;
  lastDailyClaimAt: string | null;
  equippedSectorTheme: SectorTheme | null;
  vipExpiresAt: string | null;
}) {
  usePollingRefresh();

  const gdp = useTickingValue(country.gdp, country.gdpPerSec);
  const treasury = useTickingValue(country.treasury, country.treasuryRegenPerSec);
  const mutationBySector = new Map(mutations.map((m) => [m.sector, m]));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <CountryFlag
          countryCode={country.countryCode}
          flagEmoji={country.flagEmoji}
          flagStyle={country.flagStyle}
          name={country.name}
          size="md"
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            {country.name}
            {isVipActive(vipExpiresAt) && <VipBadge />}
          </h1>
          <RankBadge gdp={country.gdp} />
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-brand-500/20 bg-zinc-900 text-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-400">GDP</p>
          <p className="text-xl font-bold tabular-nums">{formatWithCommas(gdp)}</p>
          <p className="text-xs text-zinc-400">
            {country.gdpPerSec >= 0 ? "+" : ""}
            {formatRateWithCommas(country.gdpPerSec)}/s
          </p>
        </div>

        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Treasury</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatWithCommas(treasury)}
          </p>
          <p className="text-xs text-zinc-500">
            +{formatRateWithCommas(country.treasuryRegenPerSec)}/s
          </p>
        </div>

        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4 flex flex-col gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Credits</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatWithCommas(credits)}
            </p>
          </div>
          <DailyRewardChip lastClaimedAt={lastDailyClaimAt} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Sectors
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {sectors.map((s) => (
            <SectorCard
              key={s.sector}
              state={s}
              mutation={mutationBySector.get(s.sector)}
              equippedTheme={equippedSectorTheme}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
