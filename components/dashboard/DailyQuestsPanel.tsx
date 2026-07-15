"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimQuest } from "@/lib/actions/quests";
import { QUEST_CATALOG, type DailyQuest } from "@/lib/game/quests";
import { formatCompact } from "@/lib/game/format";

export function DailyQuestsPanel({ quests }: { quests: DailyQuest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Hide the whole panel once every quest for the day has been claimed -
  // no dead UI space just showing "come back tomorrow".
  const unclaimed = quests.filter((q) => q.claimedAt === null);
  if (unclaimed.length === 0) {
    return null;
  }

  function handleClaim(questId: string, credits: number) {
    setMessage(null);
    startTransition(async () => {
      const result = await claimQuest(questId);
      if (result.ok) {
        setMessage(`+${result.creditsGranted} credits`);
        router.refresh();
      } else if (result.reason === "NOT_COMPLETE") {
        setMessage("Not finished yet.");
      } else if (result.reason === "ALREADY_CLAIMED") {
        setMessage("Already claimed.");
      } else {
        setMessage("Couldn't claim. Try again.");
      }
      // Reference credits so the tuple is used (helps future extensions
      // where we might show the potential reward inline in the message).
      void credits;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
          Daily Quests
        </h2>
        {message && <span className="text-xs text-brand-500">{message}</span>}
      </div>
      <div className="flex flex-col gap-2">
        {unclaimed.map((q) => {
          const def = QUEST_CATALOG[q.questKey];
          const label = def?.label ?? q.questKey;
          const hint = def?.hint ?? "";
          const pct = Math.min(100, Math.floor((q.progress / Math.max(1, q.target)) * 100));
          const complete = q.completedAt !== null;
          return (
            <div
              key={q.id}
              className="rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 shadow-sm p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{label}</p>
                  {hint && <p className="text-xs text-zinc-500 truncate">{hint}</p>}
                </div>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                  +{q.rewardCredits} credits
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${complete ? "bg-emerald-500" : "bg-brand-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-zinc-500 shrink-0">
                  {formatCompact(q.progress)} / {formatCompact(q.target)}
                </span>
                {complete && (
                  <button
                    type="button"
                    onClick={() => handleClaim(q.id, q.rewardCredits)}
                    disabled={pending}
                    className="text-xs rounded-full px-3 py-1 bg-amber-500 text-black font-semibold disabled:opacity-50"
                  >
                    Claim
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
