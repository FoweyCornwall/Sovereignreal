"use client";

import { useEffect, useRef, useState } from "react";
import { pollMatch, submitClaim, endTurn, type MatchStateResponse } from "@/lib/actions/pvpMatch";
import { HexBoard } from "@/components/pvp/HexBoard";
import { formatWithCommas } from "@/lib/game/format";

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
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  function scheduleNextPoll() {
    pollTimeout.current = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function poll() {
    if (cancelled.current) return;
    const result = await pollMatch(matchId);
    if (cancelled.current) return;
    setState(result);
    if (result.status === "active") {
      scheduleNextPoll();
    }
  }

  useEffect(() => {
    cancelled.current = false;
    poll();
    const tickInterval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      cancelled.current = true;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function handleClaim(q: number, r: number) {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await submitClaim(matchId, q, r);
      setState(result);
      if (result.claimResult && !result.claimResult.ok) {
        setMessage(claimErrorMessage(result.claimResult.reason));
      }
    } finally {
      setPending(false);
    }
  }

  async function handleEndTurn() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await endTurn(matchId);
      setState(result);
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

  const opponentCountryId = state.mySide === "a" ? state.sideBCountryId : state.sideACountryId;
  const myCash = state.mySide === "a" ? state.sideACash : state.sideBCash;
  const opponentCash = state.mySide === "a" ? state.sideBCash : state.sideACash;
  const myAp = state.mySide === "a" ? state.sideAApRemaining : state.sideBApRemaining;
  const isMyTurn = state.status === "active" && state.currentTurnCountryId === countryId;
  const remainingMs = Math.max(0, new Date(state.turnDeadline).getTime() - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const plyNumber = state.turnNumber;
  const totalPlies = state.turnsPerSide * 2;

  if (state.status === "completed") {
    const won = state.winnerCountryId === countryId;
    const draw = state.winnerCountryId === null;

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
          Final cash: {formatWithCommas(myCash)} vs {formatWithCommas(opponentCash)}
          {!draw && state.payoutAmount
            ? won
              ? ` — you looted ${formatWithCommas(state.payoutAmount)} treasury.`
              : ` — you lost ${formatWithCommas(state.payoutAmount)} treasury.`
            : ""}
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
            <p className="text-xs text-zinc-500">Your Cash</p>
            <p className="font-semibold">{formatWithCommas(myCash)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Opponent Cash</p>
            <p className="font-semibold">{formatWithCommas(opponentCash)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Turn</p>
            <p className="font-semibold">
              {plyNumber}/{totalPlies}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className={isMyTurn ? "text-brand-500 font-medium" : "text-zinc-500"}>
            {isMyTurn ? `Your turn — ${myAp} AP left` : "Opponent's turn"}
          </span>
          <span className="tabular-nums text-zinc-500">{remainingSeconds}s</span>
        </div>

        {(state.oilSaturatedUntilTurn ?? 0) >= state.turnNumber && (
          <p className="text-xs text-amber-500">Oil market saturated — income crashed.</p>
        )}
        {(state.techSaturatedUntilTurn ?? 0) >= state.turnNumber && (
          <p className="text-xs text-amber-500">Tech market saturated — income crashed.</p>
        )}
        {(state.agricultureSaturatedUntilTurn ?? 0) >= state.turnNumber && (
          <p className="text-xs text-amber-500">Agriculture market saturated — income crashed.</p>
        )}

        {message && <p className="text-xs text-red-500">{message}</p>}

        {isMyTurn && (
          <button
            type="button"
            onClick={handleEndTurn}
            disabled={pending}
            className="self-start text-xs rounded-full px-3 py-1.5 border border-black/5 dark:border-white/5 disabled:opacity-50"
          >
            End Turn
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
        <HexBoard
          tiles={state.tiles}
          myCountryId={countryId}
          opponentCountryId={opponentCountryId}
          onClaim={handleClaim}
          canClaim={isMyTurn && !pending}
        />
      </div>
    </div>
  );
}

function claimErrorMessage(reason?: string): string {
  switch (reason) {
    case "NOT_ADJACENT":
      return "That tile isn't connected to your territory.";
    case "INSUFFICIENT_AP":
      return "Not enough Action Points left this turn.";
    case "TILE_NOT_CLAIMABLE":
      return "That tile is already claimed.";
    default:
      return "Couldn't claim that tile.";
  }
}
