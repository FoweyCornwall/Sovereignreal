"use client";

import { useTheme, type ThemePreference } from "@/lib/theme/useTheme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="inline-flex rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.08] backdrop-blur-xl p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setPreference(opt.value)}
          className={`rounded-lg px-3 py-1 text-sm font-medium transition-colors ${
            preference === opt.value
              ? "bg-amber-500 text-black"
              : "text-zinc-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
