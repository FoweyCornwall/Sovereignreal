"use client";

import { useEffect, useRef, useState } from "react";
import { SECTOR_LABELS } from "@/lib/game/constants";
import { formatDelta, formatDuration, formatWithCommas } from "@/lib/game/format";
import {
  computeEffectiveCost,
  STACK_NEGATIVE_FACTOR,
  STACK_POSITIVE_FACTOR,
} from "@/lib/game/store";
import { computeEffectiveDelta } from "@/lib/game/gdp";
import type { EnactPolicyResult, SectorState, StoreSlot } from "@/lib/types/game";

const TIER_COLOR: Record<number, string> = {
  1: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  2: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200",
  3: "bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-200",
  4: "bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200",
  5: "bg-brand-300 text-brand-950 dark:bg-brand-500 dark:text-black",
};

export function PolicyCard({
  slot,
  sectors,
  gdp,
  stackCount,
  onEnact,
  pending,
}: {
  slot: StoreSlot;
  sectors: SectorState[];
  gdp: number;
  stackCount: number;
  onEnact: (slot: StoreSlot) => Promise<EnactPolicyResult>;
  pending: boolean;
}) {
  const scoreBySector = new Map(sectors.map((s) => [s.sector, s.score]));
  const deltaEntries = Object.entries(slot.statDeltas);
  const effectiveCost = computeEffectiveCost(slot.baseCost, gdp);
  const soldOut = slot.quantity <= 0;
  const lowStock = !soldOut && slot.quantity <= slot.initialQuantity * 0.15;
  // Positive deltas shrink and negatives grow with each stacked enactment
  // (matches enact_store_policy() in 0004_policy_store.sql). This is the
  // "derived benefit" the store card advertises: the effect of the NEXT
  // enactment, which changes every time the player enacts this policy again.
  const posStack = Math.pow(STACK_POSITIVE_FACTOR, stackCount);
  const negStack = Math.pow(STACK_NEGATIVE_FACTOR, stackCount);

  // Enact click state: enactedTick is monotonically increasing so a fresh
  // chip <span> re-mounts (via key) every click. The button's pulse animation
  // is replayed independently by removing then re-adding the class via a ref
  // (React alone doesn't restart a CSS keyframe animation when the same
  // class stays on the element).
  const [enactedTick, setEnactedTick] = useState(0);
  const [shakeTick, setShakeTick] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (enactedTick === 0 || !buttonRef.current) return;
    const el = buttonRef.current;
    el.classList.remove("enact-button-pulse");
    // Force a reflow so removing + adding the class actually restarts the
    // animation - browsers batch DOM writes otherwise.
    void el.offsetWidth;
    el.classList.add("enact-button-pulse");
  }, [enactedTick]);

  useEffect(() => {
    if (shakeTick === 0 || !buttonRef.current) return;
    const el = buttonRef.current;
    el.classList.remove("enact-button-shake");
    void el.offsetWidth;
    el.classList.add("enact-button-shake");
  }, [shakeTick]);

  async function handleClick() {
    const result = await onEnact(slot);
    if (result.ok) {
      setEnactedTick((t) => t + 1);
    } else if (result.reason === "INSUFFICIENT_FUNDS" || result.reason === "QUEUE_FULL") {
      setShakeTick((t) => t + 1);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${TIER_COLOR[slot.tier]}`}>
          Tier {slot.tier}
        </span>
        <span className="text-xs text-zinc-500">{SECTOR_LABELS[slot.primarySector]}</span>
      </div>

      <h3 className="font-semibold">{slot.title}</h3>
      {slot.description && (
        <p className="text-sm text-zinc-500">{slot.description}</p>
      )}

      <ul className="text-sm flex flex-col gap-0.5">
        {deltaEntries.map(([sector, delta]) => {
          const currentScore = scoreBySector.get(sector as keyof typeof SECTOR_LABELS) ?? 0;
          const stackedDelta = delta! >= 0 ? delta! * posStack : delta! * negStack;
          const effectiveDelta = computeEffectiveDelta(stackedDelta, currentScore);
          const isDampened =
            stackedDelta > 0 && Math.abs(effectiveDelta - stackedDelta) > 0.001;
          const isStacked = stackCount > 0 && Math.abs(stackedDelta - delta!) > 0.001;
          return (
            <li
              key={sector}
              className={delta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
            >
              {formatDelta(effectiveDelta)} {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS]}
              {(isDampened || isStacked) && (
                <span className="text-zinc-400 dark:text-zinc-600">
                  {" "}
                  (base {formatDelta(delta!)}
                  {isStacked ? `, stacked x${stackCount}` : ""}
                  {isDampened ? `, ${currentScore.toFixed(0)}/100 already` : ""})
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>Cost: {formatWithCommas(effectiveCost)}</span>
        <span>{formatDuration(slot.durationSeconds)}</span>
      </div>

      <p className={`text-xs ${soldOut ? "text-red-500" : lowStock ? "text-brand-500" : "text-zinc-500"}`}>
        {soldOut ? "Sold Out" : `${slot.quantity} in stock`}
      </p>

      <div className="relative">
        {enactedTick > 0 && (
          <div
            key={enactedTick}
            className="enact-fly-up pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 flex flex-col items-center gap-0.5 text-sm font-semibold whitespace-nowrap"
          >
            {deltaEntries.map(([sector, delta]) => {
              const currentScore =
                scoreBySector.get(sector as keyof typeof SECTOR_LABELS) ?? 0;
              const stackedDelta =
                delta! >= 0 ? delta! * posStack : delta! * negStack;
              const effectiveDelta = computeEffectiveDelta(stackedDelta, currentScore);
              return (
                <span
                  key={sector}
                  className={
                    delta! >= 0
                      ? "text-emerald-500 drop-shadow-sm"
                      : "text-red-500 drop-shadow-sm"
                  }
                >
                  {formatDelta(effectiveDelta)}{" "}
                  {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS]}
                </span>
              );
            })}
          </div>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={handleClick}
          disabled={pending || soldOut}
          className="w-full rounded-xl bg-brand-500 text-black font-medium py-2.5 shadow-sm shadow-brand-500/20 disabled:opacity-50"
        >
          {soldOut ? "Sold Out" : "Enact"}
        </button>
      </div>
    </div>
  );
}
