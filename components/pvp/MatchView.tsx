"use client";

import { useEffect, useRef, useState } from "react";
import {
  pollMatch,
  submitAttack,
  forfeitMatch,
  type MatchStateResponse,
} from "@/lib/actions/pvpMatch";
import { SiegeRing } from "@/components/pvp/SiegeRing";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { SECTOR_LABELS, type Sector } from "@/lib/game/constants";
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
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [flashSector, setFlashSector] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [lastRoundMessage, setLastRoundMessage] = useState<string | null>(null);
  const seenRoundSectors = useRef<Set<string>>(new Set());
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  function applyReveal(next: MatchStateResponse) {
    for (const s of next.sectors) {
      if (s.revealed && !seenRoundSectors.current.has(s.sector)) {
        seenRoundSectors.current.add(s.sector);
        setFlashSector(s.sector);
        setFlashKey((k) => k + 1);
        const iWon = s.winnerSide === next.mySide;
        setLastRoundMessage(
          `${SECTOR_LABELS[s.sector]}: you ${iWon ? "won" : "lost"} (${s.sideAScore?.toFixed(1)} vs ${s.sideBScore?.toFixed(1)})`
        );
      }
    }
  }

  function scheduleNextPoll() {
    pollTimeout.current = setTimeout(poll, POLL_INTERVAL_MS);
  }

  async function poll() {
    if (cancelled.current) return;
    try {
      const result = await pollMatch(matchId);
      if (cancelled.current) return;
      setError(null);
      applyReveal(result);
      setState(result);
      if (result.status === "active") {
        scheduleNextPoll();
      }
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : "Couldn't reach the match.");
      // Keep retrying - a transient blip (or a migration that just landed)
      // self-heals on the next poll without the player having to reload.
      scheduleNextPoll();
    }
  }

  useEffect(() => {
    cancelled.current = false;
    seenRoundSectors.current = new Set();
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
    try {
      const result = await submitAttack(matchId, sector);
      setError(null);
      applyReveal(result);
      setState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attack failed.");
    } finally {
      setPending(false);
    }
  }

  async function handleLeave() {
    if (pending) return;
    setPending(true);
    try {
      const result = await forfeitMatch(matchId);
      setError(null);
      setState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave the match.");
    } finally {
      setPending(false);
      setConfirmingLeave(false);
    }
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5 flex flex-col items-center gap-3">
        {error ? (
          <>
            <p className="text-sm text-red-500 text-center">{error}</p>
            <p className="text-xs text-zinc-500 text-center">
              Still retrying in the background — this usually means the site is running ahead of
              the database migrations. If it doesn&apos;t recover, make sure the latest migration
              has been run.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="text-xs rounded-full px-4 py-2 border border-black/5 dark:border-white/5"
            >
              Back
            </button>
          </>
        ) : (
          <p className="text-sm text-zinc-500 animate-pulse">Loading match…</p>
        )}
      </div>
    );
  }

  const isMyTurn = state.status === "active" && state.currentTurnCountryId === countryId;
  const remainingMs = Math.max(0, new Date(state.turnDeadline).getTime() - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const myWins = state.mySide === "a" ? state.sideAWins : state.sideBWins;
  const opponentWins = state.mySide === "a" ? state.sideBWins : state.sideAWins;

  if (state.status === "completed") {
    const won = state.winnerCountryId === countryId;

    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5 flex flex-col items-center gap-4">
        <p className={`text-lg font-bold ${won ? "text-emerald-500" : "text-red-500"}`}>
          {won ? "Victory!" : "Defeat"}
        </p>
        <p className="text-sm text-zinc-500 text-center">
          {myWins}-{opponentWins} vs {state.opponentIdentity.name}
          {state.forfeited &&
            (won ? " — they left the match." : " — you left the match.")}
          {state.payoutAmount
            ? won
              ? ` You looted ${formatWithCommas(state.payoutAmount)} treasury.`
              : ` You lost ${formatWithCommas(state.payoutAmount)} treasury.`
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
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">vs</span>
          <div className="flex items-center gap-2">
            <CountryFlag
              countryCode={state.opponentIdentity.countryCode}
              flagEmoji={state.opponentIdentity.flagEmoji}
              flagStyle={state.opponentIdentity.flagStyle}
              name={state.opponentIdentity.name}
            />
            <span className="font-medium">{state.opponentIdentity.name}</span>
            {state.opponentIdentity.username && (
              <span className="text-xs text-zinc-500">@{state.opponentIdentity.username}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-2xl font-bold tabular-nums">
          <span className="text-brand-500">{myWins}</span>
          <span className="text-sm text-zinc-500 font-normal">first to {state.roundsToWin}</span>
          <span className="text-red-500">{opponentWins}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className={isMyTurn ? "text-brand-500 font-medium" : "text-zinc-500"}>
            {isMyTurn ? "Your turn" : "Opponent's turn"}
          </span>
          <span className="tabular-nums text-zinc-500">{remainingSeconds}s</span>
        </div>

        {lastRoundMessage && <p className="text-xs text-zinc-500 text-center">{lastRoundMessage}</p>}
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        {isMyTurn && (
          <p className="text-xs text-center text-brand-500 font-medium">
            {pending ? "Attacking…" : "Choose a sector below to attack"}
          </p>
        )}

        <div className="flex items-center gap-2">
          {confirmingLeave ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Leave and forfeit?</span>
              <button
                type="button"
                onClick={handleLeave}
                disabled={pending}
                className="text-xs rounded-full px-3 py-1.5 bg-red-500 text-white disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                className="text-xs rounded-full px-3 py-1.5 border border-black/5 dark:border-white/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingLeave(true)}
              className="text-xs rounded-full px-3 py-1.5 border border-black/5 dark:border-white/5 text-zinc-500"
            >
              Leave Match
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4">
        <SiegeRing
          sectors={state.sectors}
          mySide={state.mySide}
          flashSector={flashSector}
          flashKey={flashKey}
          selectable={isMyTurn && !pending}
          onSectorClick={handleAttack}
        />
      </div>
    </div>
  );
}
