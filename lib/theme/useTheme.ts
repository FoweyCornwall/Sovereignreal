"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return pref === "dark";
}

function applyTheme(pref: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveIsDark(pref));
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      // Deferred to a microtask (rather than called synchronously in the
      // effect body) - reading localStorage genuinely needs an effect
      // (it's not available during SSR/render), but the lint rule wants
      // setState to happen from within a callback, not the effect body
      // itself. Same pattern as useTickingValue's interval callback.
      queueMicrotask(() => setPreferenceState(stored));
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (preference === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreferenceState(pref);
    applyTheme(pref);
  }, []);

  return { preference, setPreference };
}
