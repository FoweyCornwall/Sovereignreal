"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { markOnboardingSeen } from "@/lib/actions/onboarding";

interface Slide {
  title: string;
  body: string;
  emoji: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "👑",
    title: "Welcome to Sovereign",
    body: "Build a nation, grow GDP, battle rivals, and rebirth for permanent boosts. It's an endless game — pick it up any time; your policies keep running while you're away.",
  },
  {
    emoji: "📊",
    title: "Your Dashboard",
    body: "GDP and Treasury tick up every second. Treasury regens at exactly half your GDP rate — so growing GDP grows everything. Watch the sector cards, they drive it all.",
  },
  {
    emoji: "🛒",
    title: "Store → Sectors → GDP",
    body: "Head to the Store to buy policies. Each policy has a countdown, then enacts and boosts one or more sectors. Higher sector scores = higher GDP per second. Sectors are uncapped — grow them forever.",
  },
  {
    emoji: "⚔️",
    title: "Battle",
    body: "Hit Battle to challenge a rival at your strength. Best-of-5 rounds, higher sector score wins the round. Win → take 15% of their treasury. Draw → nothing changes hands.",
  },
  {
    emoji: "🌟",
    title: "Rebirth",
    body: "At Diamond rank you unlock Rebirth in Settings. Your GDP and sectors reset — but every rebirth permanently doubles your GDP + Treasury rates. Stackable forever. This is the endgame loop.",
  },
];

export function OnboardingTour({ onDismiss }: { onDismiss?: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  const isLast = step === SLIDES.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleSkip();
      if (e.key === "ArrowRight") setStep((s) => Math.min(SLIDES.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish() {
    if (closing) return;
    setClosing(true);
    await markOnboardingSeen();
    onDismiss?.();
    router.refresh();
  }

  function handleSkip() {
    if (!confirm("Skip the tutorial? You can replay it from Settings anytime.")) return;
    finish();
  }

  const slide = SLIDES[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sovereign"
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-black/5 dark:border-white/5 shadow-xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "bg-brand-500 w-6"
                    : i < step
                      ? "bg-brand-500/50 w-3"
                      : "bg-zinc-300 dark:bg-zinc-700 w-3"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Skip
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 py-2">
          <span className="text-5xl" aria-hidden>
            {slide.emoji}
          </span>
          <h2 className="text-xl font-semibold text-center">{slide.title}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center leading-relaxed">
            {slide.body}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm rounded-xl border border-black/5 dark:border-white/5 px-4 py-2 disabled:opacity-40"
          >
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={finish}
              disabled={closing}
              className="text-sm rounded-xl bg-brand-500 text-black font-semibold px-6 py-2 disabled:opacity-50"
            >
              Play →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(SLIDES.length - 1, s + 1))}
              className="text-sm rounded-xl bg-brand-500 text-black font-semibold px-6 py-2"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
