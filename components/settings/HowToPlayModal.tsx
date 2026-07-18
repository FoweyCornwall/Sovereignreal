"use client";

import { useEffect, useState, useTransition } from "react";
import { replayOnboarding } from "@/lib/actions/onboarding";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "The Core Loop",
    body: "Buy policies from the Store using your Treasury. Each policy runs on a countdown, then boosts your sector scores when it enacts. Sector scores multiply into GDP per second, which regenerates Treasury (at half the GDP rate). Bigger GDP means bigger buys, means bigger sectors — the loop compounds.",
  },
  {
    title: "Ranks",
    body: "Your rank tier is determined by your GDP. Bronze → Silver → Gold → Diamond → Master → Grandmaster → Legend → Mythic → Transcendent. Climbing takes hours of playing, days for the top tiers. Watch the Leaderboard to see where you stack against everyone else.",
  },
  {
    title: "Mutations",
    body: "Every settle has a small chance of rolling a random mutation on one of your 10 sectors — Uncommon, Rare, Epic, Legendary, Mythic, Exotic, Eternal. Each mutation multiplies that sector's GDP contribution (2× up to 100×). Mutations are permanent and stack until a rarer one replaces it. Also buy Mutation Boosts from the Store's Mutations tab to increase the proc rate for a short window.",
  },
  {
    title: "Battle (PvP)",
    body: "Head to Battle to queue against another player or bot at your tier. Best-of-5, both sides pick sectors simultaneously per round — the sector with the higher score (including mutations) wins the round. Winner takes 15% of the loser's treasury. Rewards scale with your opponent's wealth.",
  },
  {
    title: "Rebirth",
    body: "Once you hit Diamond, you can Rebirth from Settings. Your GDP and sectors reset, but you keep a permanent +50% GDP bonus and +50% Treasury regen bonus per rebirth, stacking. This is the endgame loop: rebirths let you push past the natural climb wall.",
  },
];

export function HowToPlayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to Play"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-black/5 dark:border-white/5 shadow-xl p-6 flex flex-col gap-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">How to Play</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-full w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {SECTIONS.map((s) => (
          <div key={s.title} className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-brand-500 uppercase tracking-wide">
              {s.title}
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{s.body}</p>
          </div>
        ))}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 rounded-xl bg-brand-500 text-black font-semibold py-2.5 px-6 self-center"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export function HowToPlayButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleReplayTour() {
    startTransition(() => replayOnboarding());
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 py-2 px-4 w-fit"
      >
        How to Play
      </button>
      <button
        type="button"
        onClick={handleReplayTour}
        disabled={pending}
        className="text-sm rounded-xl border border-black/5 dark:border-white/5 bg-zinc-100 dark:bg-zinc-900 py-2 px-4 w-fit disabled:opacity-50"
      >
        Replay Tutorial
      </button>
      <HowToPlayModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
