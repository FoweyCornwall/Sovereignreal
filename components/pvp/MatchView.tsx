"use client";

import { useEffect, useRef, useState } from "react";
import { pollMatch, submitAttack, type MatchStateResponse } from "@/lib/actions/pvpMatch";
import { SiegeRing, type FlashTarget } from "@/components/pvp/SiegeRing";
import { formatWithCommas } from "@/lib/game/format";
import type { Sector } from "@/lib/game/constants";

const POLL_INTERVAL_MS = 1200;
const TICK_MS = 250;

export function MatchView({
  matchId,
  countryId,
  onDone,
}: {
  matchId: string;
  countryId: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<MatchStateResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [flashTarget, setFlashTarget] = useState<FlashTarget | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const lastSeenEventId = useRef<number | null>(null);
  const flashCounter = useRef(0);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  function applyNewEvents(next: MatchStateResponse) {
    const events = [...next.events].sort((a, b) => a.id - b.id);
    if (lastSeenEventId.current === null) {
      lastSeenEventId.current = events.length > 0 ? events[events.length - 1].id : 0;
      return;
    }

    const fresh = events.filter((e) => e.id > lastSeenEventId.current!);
    if (fresh.length === 0) return;

    const latest = fresh[fresh.length - 1];
    lastSeenEventId.current = latest.id;

    if (latest.outcome === "auto_pass" || !latest.targetSector) return;

    const attackerIsMe = latest.attackerCountryId === countryId;
    const side: "mine" | "opponent" = attackerIsMe ? "opponent" : "mine";
    flashCounter.current += 1;
    setFlashTarget({
      side,
      sector: latest.targetSector,
      outcome: latest.outcome,
      key: flashCounter.current,
    });

    const targetList = side === "mine" ? next.mySectors : next.opponentSectors;
    const targetNowBroken = targetList.find((s) => s.sector === latest.targetSector)?.currentScore === 0;
    if (latest.outcome === "hit" && targetNowBroken) {
      setShakeKey((k) => k + 1);
    }
  }

  function scheduleNextPoll() {
    pollTimeout.current = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function poll() {
    if (cancelled.current) return;
    const result = await pollMatch(matchId);
    if (cancelled.current) return;
    applyNewEvents(result);
    setState(result);
    if (result.status === "active") {
      scheduleNextPoll();
    }
  }

  useEffect(() => {
    cancelled.current = false;
    lastSeenEventId.current = null;
    poll();
    const tickInterval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      cancelled.current = true;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function handleAttack(sector: Sector) {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await submitAttack(matchId, sector);
      applyNewEvents(result);
      setState(result);
      if (result.attackResult && !result.attackResult.ok) {
        setMessage(attackErrorMessage(result.attackResult.reason));
      }
    } finally {
      setPending(false);
    }
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5">
        <p className="text-sm text-zinc-500 animate-pulse">Loading match…</p>
      </div>
    );
  }

  const isMyTurn = state.status === "active" && state.currentTurnCountryId === countryId;
  const remainingMs = Math.max(0, new Date(state.turnDeadline).getTime() - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const myConquests = state.mySide === "a" ? state.sideAConquests : state.sideBConquests;
  const opponentConquests = state.mySide === "a" ? state.sideBConquests : state.sideAConquests;

  if (state.status === "completed") {
    const won = state.winnerCountryId === countryId;
    const draw = state.winReason === "draw";

    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5 flex flex-col items-center gap-4">
        <p
          className={`text-lg font-bold ${
            draw ? "text-zinc-500" : won ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {draw ? "Draw" : won ? "Victory!" : "Defeat"}
        </p>
        <p className="text-sm text-zinc-500 text-center">
          Sectors broken: {myConquests} vs {opponentConquests}
          {!draw && state.payoutAmount
            ? won
              ? ` — you looted ${formatWithCommas(state.payoutAmount)} treasury.`
              : ` — you lost ${formatWithCommas(state.payoutAmount)} treasury.`
            : ""}
          {state.winReason === "conquest" && " (conquest)"}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-brand-500 text-black font-medium py-2.5 px-8"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-zinc-500">Your Breaks</p>
            <p className="font-semibold">{myConquests}/4</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Opponent Breaks</p>
            <p className="font-semibold">{opponentConquests}/4</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Turn</p>
            <p className="font-semibold">
              {state.turnNumber}/{state.turnsPerSide * 2}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className={isMyTurn ? "text-brand-500 font-medium" : "text-zinc-500"}>
            {isMyTurn ? "Your turn — pick a sector to attack" : "Opponent's turn"}
          </span>
          <span className="tabular-nums text-zinc-500">{remainingSeconds}s</span>
        </div>

        {message && <p className="text-xs text-red-500">{message}</p>}
      </div>

      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
        <SiegeRing
          mySectors={state.mySectors}
          opponentSectors={state.opponentSectors}
          canAttack={isMyTurn && !pending}
          onAttack={handleAttack}
          flashTarget={flashTarget}
          shakeKey={shakeKey}
        />
      </div>
    </div>
  );
}

function attackErrorMessage(reason?: string): string {
  switch (reason) {
    case "SECTOR_ALREADY_BROKEN":
      return "That sector's already broken — pick another.";
    case "INVALID_SECTOR":
      return "That's not a valid sector.";
    default:
      return "Couldn't attack that sector.";
  }
}
