"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  findBattle,
  cancelBattleSearch,
  type BattleResult,
  type RecentBattle,
} from "@/lib/actions/battle";
import { formatWithCommas } from "@/lib/game/format";

type Phase = "idle" | "searching" | "fighting" | "result" | "error";

const POLL_INTERVAL_MS = 1200;
const FIGHT_ANIMATION_MS = 1800;

export function BattleArena({
  countryId,
  recentBattles,
}: {
  countryId: string;
  recentBattles: RecentBattle[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [isBot, setIsBot] = useState(false);
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    };
  }, []);

  function scheduleNextPoll() {
    pollTimeout.current = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function poll() {
    if (cancelled.current) return;
    const result = await findBattle();
    if (cancelled.current) return;

    if (!result.ok) {
      setPhase("error");
      setErrorMessage(
        result.reason === "NO_OPPONENT_AVAILABLE"
          ? "No opponents available right now — try again shortly."
          : "Something went wrong finding a battle."
      );
      return;
    }

    if (!result.matched) {
      scheduleNextPoll();
      return;
    }

    setIsBot(result.isBot);
    setBattle(result.battle);
    setPhase("fighting");
    setTimeout(() => {
      if (!cancelled.current) setPhase("result");
      router.refresh();
    }, FIGHT_ANIMATION_MS);
  }

  function handleFindBattle() {
    cancelled.current = false;
    setErrorMessage(null);
    setBattle(null);
    setPhase("searching");
    poll();
  }

  function handleCancel() {
    cancelled.current = true;
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    startCancelAction();
    setPhase("idle");
  }

  function startCancelAction() {
    cancelBattleSearch();
  }

  function handleReset() {
    setPhase("idle");
    setBattle(null);
  }

  const won = battle && battle.winner_id === countryId;
  const attackerPower = battle?.attacker_power ?? 0;
  const defenderPower = battle?.defender_power ?? 0;
  const totalPower = attackerPower + defenderPower || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5 flex flex-col items-center gap-4">
        {phase === "idle" && (
          <>
            <p className="text-sm text-zinc-500 text-center">
              Fight another player in real time, or a bot if no one&apos;s around. Winner takes
              10% of the loser&apos;s treasury.
            </p>
            <button
              type="button"
              onClick={handleFindBattle}
              className="rounded-xl bg-brand-500 text-black font-medium py-2.5 px-8"
            >
              Find Battle
            </button>
          </>
        )}

        {phase === "searching" && (
          <>
            <p className="text-sm text-zinc-500 animate-pulse">Searching for an opponent…</p>
            <button
              type="button"
              onClick={handleCancel}
              className="text-sm rounded-xl border border-black/5 dark:border-white/5 px-4 py-2"
            >
              Cancel
            </button>
          </>
        )}

        {(phase === "fighting" || phase === "result") && battle && (
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>You</span>
              <span>{isBot ? "Bot Opponent" : "Opponent"}</span>
            </div>
            <div className="h-4 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex">
              <div
                className="h-full bg-brand-500 transition-all ease-out"
                style={{
                  width: `${(attackerPower / totalPower) * 100}%`,
                  transitionDuration: phase === "fighting" ? `${FIGHT_ANIMATION_MS}ms` : "0ms",
                }}
              />
              <div
                className="h-full bg-red-500 transition-all ease-out"
                style={{
                  width: `${(defenderPower / totalPower) * 100}%`,
                  transitionDuration: phase === "fighting" ? `${FIGHT_ANIMATION_MS}ms` : "0ms",
                }}
              />
            </div>

            {phase === "result" && (
              <>
                <p
                  className={`text-center text-lg font-bold ${
                    won ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {won ? "Victory!" : "Defeat"}
                </p>
                <p className="text-center text-sm text-zinc-500">
                  {won
                    ? `You looted ${formatWithCommas(battle.loot_amount)} treasury.`
                    : `You lost ${formatWithCommas(battle.loot_amount)} treasury.`}
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-xl bg-brand-500 text-black font-medium py-2.5"
                >
                  Fight Again
                </button>
              </>
            )}
          </div>
        )}

        {phase === "error" && (
          <>
            <p className="text-sm text-red-500 text-center">{errorMessage}</p>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-xl border border-black/5 dark:border-white/5 px-4 py-2 text-sm"
            >
              Back
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Recent Battles
        </h2>
        <div className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {recentBattles.length === 0 && (
            <p className="text-sm text-zinc-500 px-4 py-3">No battles yet.</p>
          )}
          {recentBattles.map((b) => {
            const iWon = b.winnerId === countryId;
            const iAttacked = b.attackerId === countryId;
            const opponentName = iAttacked
              ? b.defenderIsBot
                ? `${b.defenderName} (Bot)`
                : b.defenderName
              : b.attackerName;
            return (
              <div key={b.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {iAttacked ? "Attacked" : "Defended vs"} {opponentName}
                </span>
                <span className={iWon ? "text-emerald-500" : "text-red-500"}>
                  {iWon ? "+" : "-"}
                  {formatWithCommas(b.lootAmount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
