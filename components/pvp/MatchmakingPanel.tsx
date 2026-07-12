"use client";

import { useEffect, useRef, useState } from "react";
import { findMatch, cancelMatchSearch } from "@/lib/actions/pvpMatch";

const POLL_INTERVAL_MS = 1200;

export function MatchmakingPanel({ onMatched }: { onMatched: (matchId: string) => void }) {
  const [phase, setPhase] = useState<"idle" | "searching" | "error">("idle");
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
    const result = await findMatch();
    if (cancelled.current) return;

    if (!result.ok) {
      setPhase("error");
      setErrorMessage(
        result.reason === "NO_OPPONENT_AVAILABLE"
          ? "No opponents available right now — try again shortly."
          : "Something went wrong finding a match."
      );
      return;
    }

    if (!result.matched) {
      scheduleNextPoll();
      return;
    }

    onMatched(result.matchId);
  }

  function handleFindMatch() {
    cancelled.current = false;
    setErrorMessage(null);
    setPhase("searching");
    poll();
  }

  function handleCancel() {
    cancelled.current = true;
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    cancelMatchSearch();
    setPhase("idle");
  }

  return (
    <div className="rounded-2xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-5 flex flex-col items-center gap-4">
      {phase === "idle" && (
        <>
          <p className="text-sm text-zinc-500 text-center">
            Take turns revealing a random sector — whoever&apos;s stronger there wins the round.
            First to 5 round wins takes the match. You can leave anytime, but it counts as a
            loss.
          </p>
          <button
            type="button"
            onClick={handleFindMatch}
            className="rounded-xl bg-brand-500 text-black font-medium py-2.5 px-8"
          >
            Find Match
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

      {phase === "error" && (
        <>
          <p className="text-sm text-red-500 text-center">{errorMessage}</p>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="rounded-xl border border-black/5 dark:border-white/5 px-4 py-2 text-sm"
          >
            Back
          </button>
        </>
      )}
    </div>
  );
}
