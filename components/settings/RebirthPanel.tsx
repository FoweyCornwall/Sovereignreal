"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebirthCountry } from "@/lib/actions/prestige";
import {
  ASCENSION_MIN_GDP,
  GDP_BONUS_PER_PRESTIGE,
  TREASURY_BONUS_PER_PRESTIGE,
  canAscend,
  prestigeBonusPercents,
} from "@/lib/game/prestige";
import { formatWithCommas } from "@/lib/game/format";

const CONFIRM_WORD = "REBIRTH";

export function RebirthPanel({
  gdp,
  prestigeCount,
}: {
  gdp: number;
  prestigeCount: number;
}) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const eligible = canAscend(gdp);
  const currentBonuses = prestigeBonusPercents(prestigeCount);
  const nextBonuses = prestigeBonusPercents(prestigeCount + 1);
  const nextGdpDelta = Math.round(GDP_BONUS_PER_PRESTIGE * 100);
  const nextTreasuryDelta = Math.round(TREASURY_BONUS_PER_PRESTIGE * 100);

  function openModal() {
    setTyped("");
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    if (pending) return;
    setShowModal(false);
    setTyped("");
    setError(null);
  }

  function handleRebirth() {
    setError(null);
    startTransition(async () => {
      const result = await rebirthCountry();
      if (result.ok) {
        setShowModal(false);
        setTyped("");
        router.refresh();
      } else if (result.reason === "NOT_ELIGIBLE") {
        setError(
          `You need ${formatWithCommas(result.requiredGdp)} GDP to rebirth. You have ${formatWithCommas(result.currentGdp)}.`
        );
      } else {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">
            {prestigeCount > 0 ? `★${prestigeCount} · Reborn` : "Rebirth"}
          </p>
          {prestigeCount > 0 ? (
            <p className="text-xs text-zinc-500">
              +{currentBonuses.gdpPct}% GDP/sec · +{currentBonuses.treasuryPct}% treasury
              regen (permanent)
            </p>
          ) : (
            <p className="text-xs text-zinc-500">
              Reset visible progress in exchange for a permanent multiplier.
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        {eligible
          ? `Next rebirth: +${nextGdpDelta}% GDP, +${nextTreasuryDelta}% treasury → ★${prestigeCount + 1} · +${nextBonuses.gdpPct}% / +${nextBonuses.treasuryPct}% total.`
          : `Requires ${formatWithCommas(ASCENSION_MIN_GDP)} GDP (Diamond). You have ${formatWithCommas(gdp)}.`}
      </p>

      <button
        type="button"
        onClick={openModal}
        disabled={!eligible}
        className="self-start rounded-xl border border-amber-500 bg-amber-500 text-black font-medium py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Rebirth
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-2xl border border-amber-500/60 bg-white dark:bg-zinc-900 p-5 flex flex-col gap-3">
            <h3 className="text-lg font-bold">Rebirth?</h3>
            <div className="text-sm flex flex-col gap-2">
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400">
                  This resets:
                </p>
                <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                  <li>All sector scores → 0</li>
                  <li>All mutations wiped</li>
                  <li>Active policies + boosts wiped</li>
                  <li>
                    GDP → 0, treasury → {formatWithCommas(1000)}
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  You keep:
                </p>
                <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                  <li>Credits, VIP, country identity, themes</li>
                  <li>Lifetime GDP history + settled policy log</li>
                  <li>All existing rebirth bonuses</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  You gain (permanent):
                </p>
                <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                  <li>
                    +{nextGdpDelta}% base GDP/sec (→ +{nextBonuses.gdpPct}% total)
                  </li>
                  <li>
                    +{nextTreasuryDelta}% treasury regen (→ +
                    {nextBonuses.treasuryPct}% total)
                  </li>
                </ul>
              </div>
            </div>

            <label className="text-xs text-zinc-500 flex flex-col gap-1">
              Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to
              confirm:
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-3 py-2 text-sm font-mono"
                autoCapitalize="characters"
              />
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="rounded-xl border border-black/10 dark:border-white/10 py-2 px-4 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRebirth}
                disabled={pending || typed !== CONFIRM_WORD}
                className="rounded-xl bg-amber-500 text-black font-medium py-2 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Reborn…" : "Rebirth"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
