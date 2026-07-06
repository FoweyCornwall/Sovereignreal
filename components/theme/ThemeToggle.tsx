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
    <div className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-800 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setPreference(opt.value)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
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
