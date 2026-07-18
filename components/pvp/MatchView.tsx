"use client";

import { useEffect, useRef, useState } from "react";
import {
  pollMatch,
  submitPick,
  forfeitMatch,
  type MatchStateResponse,
} from "@/lib/actions/pvpMatch";
import { SiegeRing } from "@/components/pvp/SiegeRing";
import { CountryFlag } from "@/components/ui/CountryFlag";
import type { Sector } from "@/lib/game/constants";
import { formatWithCommas } from "@/lib/game/format";

const POLL_INTERVAL_MS = 1200;
const TICK_MS = 250;
const REVEAL_HOLD_MS = 3000;
const FINAL_HOLD_MS = 2000;

export function MatchView({
  matchId,
  countryId,
  onDone,
}: {
  matchId: string;
  countryId: string;
  onDone: () => void;
}) {
  const [live, setLive] = useState<MatchStateResponse | null>(null);
  const [displayedRoundNumber, setDisplayedRoundNumber] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [flashSectors, setFlashSectors] = useState<string[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const liveRef = useRef<MatchStateResponse | null>(null);
  const displayedRef = useRef(0);
  const revealingRef = useRef(false);
  const initializedRef = useRef(false);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  function setDisplayed(n: number) {
    displayedRef.current = n;
    setDisplayedRoundNumber(n);
  }

  function setRevealing(v: boolean) {
    revealingRef.current = v;
    setIsRevealing(v);
  }

  // Holds each newly-resolved round for 3s before revealing it, chaining
  // one round at a time if the server has raced ahead (e.g. a bot's pick
  // resolved a round instantly). On the round that finishes the match
  // naturally (round 5 actually resolving), holds an extra 2s before
  // flipping to the completed screen. A forfeit skips the extra hold -
  // straight to the completed screen once whatever was last resolved has
  // had its normal 3s reveal.
  function advanceReveal() {
    if (revealingRef.current) return;
    const current = liveRef.current;
    if (!current) return;

    const targetIndex = displayedRef.current;
    const targetRound = current.rounds[targetIndex];

    if (targetRound && targetRound.resolved) {
      setRevealing(true);
      const sectors = targetRound.sameSector
        ? [targetRound.mySector].filter((s): s is Sector => Boolean(s))
        : [targetRound.mySector, targetRound.opponentSector].filter(
            (s): s is Sector => Boolean(s)
          );

      revealTimeout.current = setTimeout(() => {
        if (cancelled.current) return;
        setFlashSectors(sectors);
        setFlashKey((k) => k + 1);
        setDisplayed(displayedRef.current + 1);
        setRevealing(false);

        const isFinalRound = targetRound.roundNumber === current.roundsTotal;
        const naturalCompletion = current.status === "completed" && !current.forfeited;

        if (isFinalRound && naturalCompletion) {
          revealTimeout.current = setTimeout(() => {
            if (cancelled.current) return;
            setShowCompleted(true);
          }, FINAL_HOLD_MS);
        } else {
          advanceReveal();
        }
      }, REVEAL_HOLD_MS);
      return;
    }

    if (current.status === "completed" && current.forfeited) {
      setShowCompleted(true);
    }
  }

  function applyServerState(next: MatchStateResponse) {
    liveRef.current = next;
    setLive(next);

    if (!initializedRef.current) {
      initializedRef.current = true;
      const resolvedCount = next.rounds.filter((r) => r.resolved).length;
      setDisplayed(resolvedCount);
      if (next.status === "completed") {
        setShowCompleted(true);
      }
      return;
    }

    advanceReveal();
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
      applyServerState(result);
      if (result.status === "active") {
        scheduleNextPoll();
      }
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : "Couldn't reach the match.");
      scheduleNextPoll();
    }
  }

  useEffect(() => {
    // No manual state reset needed here - BattleClient keys this component
    // by matchId, so switching matches fully remounts it and every
    // useState/useRef above already starts at its fresh initial value.
    cancelled.current = false;
    poll();
    const tickInterval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      cancelled.current = true;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
      if (revealTimeout.current) clearTimeout(revealTimeout.current);
      clearInterval(tickInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function handlePick(sector: Sector) {
    if (pending || !live || live.myPendingSector) return;
    setPending(true);
    try {
      const result = await submitPick(matchId, sector);
      setError(null);
      applyServerState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pick failed.");
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
      applyServerState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave the match.");
    } finally {
      setPending(false);
      setConfirmingLeave(false);
    }
  }

  if (!live) {
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

  const displayedRounds = live.rounds.slice(0, displayedRoundNumber);
  const myWins = displayedRounds.reduce((sum, r) => sum + (r.myPoints ?? 0), 0);
  const opponentWins = displayedRounds.reduce((sum, r) => sum + (r.opponentPoints ?? 0), 0);
  const serverResolvedCount = live.rounds.filter((r) => r.resolved).length;
  const caughtUp = displayedRoundNumber === serverResolvedCount;
  const remainingMs = Math.max(0, new Date(live.roundDeadline).getTime() - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const canPickNow =
    live.status === "active" && caughtUp && !isRevealing && !live.myPendingSector && !pending;

  if (showCompleted) {
    const isDraw = live.isDraw;
    const won = !isDraw && live.winnerCountryId === countryId;
    const payout = live.payoutAmount ?? 0;
    const outcomeLabel = isDraw ? "Draw" : won ? "Victory" : "Defeat";
    const outcomeColor = isDraw
      ? "text-zinc-400"
      : won
        ? "text-emerald-500"
        : "text-red-500";

    return (
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-8 flex flex-col items-center gap-6">
        <p
          className={`text-5xl sm:text-6xl font-extrabold tracking-tight ${outcomeColor}`}
        >
          {outcomeLabel}
        </p>

        {!isDraw && payout > 0 && (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`text-3xl sm:text-4xl font-bold tabular-nums ${
                won ? "text-amber-500" : "text-red-500"
              }`}
              title={formatWithCommas(payout)}
            >
              {won ? "+" : "−"}
              {formatWithCommas(payout)}
            </span>
            <span className="text-xs uppercase tracking-widest text-zinc-500">
              treasury {won ? "looted" : "lost"}
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 text-xl font-bold tabular-nums">
          <span className="text-brand-500">{myWins}</span>
          <span className="text-zinc-400 font-normal">—</span>
          <span className="text-red-500">{opponentWins}</span>
        </div>

        <p className="text-sm text-zinc-500 text-center">
          vs {live.opponentIdentity.name}
          {live.forfeited &&
            (won ? " — they left the match." : " — you left the match.")}
        </p>

        <button
          type="button"
          onClick={onDone}
          className="rounded-xl bg-brand-500 text-black font-semibold py-2.5 px-8 mt-2"
        >
          Return to Matchmaking
        </button>
      </div>
    );
  }

  let statusText: string;
  if (isRevealing || !caughtUp) {
    statusText = "Revealing round…";
  } else if (live.myPendingSector && !live.opponentHasPicked) {
    statusText = "Locked in — waiting for opponent…";
  } else if (live.myPendingSector && live.opponentHasPicked) {
    statusText = "Resolving round…";
  } else if (pending) {
    statusText = "Submitting…";
  } else {
    statusText = "Choose a sector below";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">vs</span>
          <div className="flex items-center gap-2">
            <CountryFlag
              countryCode={live.opponentIdentity.countryCode}
              flagEmoji={live.opponentIdentity.flagEmoji}
              flagStyle={live.opponentIdentity.flagStyle}
              name={live.opponentIdentity.name}
            />
            <span className="font-medium">{live.opponentIdentity.name}</span>
            {live.opponentIdentity.username && (
              <span className="text-xs text-zinc-500">@{live.opponentIdentity.username}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-2xl font-bold tabular-nums">
          <span className="text-brand-500">{myWins}</span>
          <span className="text-sm text-zinc-500 font-normal">
            round {live.roundNumber} of {live.roundsTotal}
          </span>
          <span className="text-red-500">{opponentWins}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-500">{statusText}</span>
          <span className="tabular-nums text-zinc-500">{remainingSeconds}s</span>
        </div>

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

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
          rounds={live.rounds}
          displayedRoundNumber={displayedRoundNumber}
          myPendingSector={live.myPendingSector}
          selectable={canPickNow}
          flashSectors={flashSectors}
          flashKey={flashKey}
          onSectorClick={handlePick}
        />
      </div>
    </div>
  );
}
