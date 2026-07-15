"use client";

import { useSyncExternalStore } from "react";
import { isSoundEnabled, setSoundEnabled } from "@/lib/audio/sounds";

// Small on/off toggle for click/error sound effects, mirrors
// ThemeToggle.tsx's localStorage pattern. useSyncExternalStore is the
// right hook for reading external mutable state (localStorage) and
// subscribing to changes - avoids the setState-in-effect lint hazard.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("sound-enabled-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("sound-enabled-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function AudioToggle() {
  const enabled = useSyncExternalStore(
    subscribe,
    () => isSoundEnabled(),
    // Server snapshot: match the client default so SSR + hydration agree.
    () => true
  );

  function toggle() {
    setSoundEnabled(!enabled);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="self-start rounded-xl border border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900 py-2 px-4 text-sm"
    >
      Sound effects: <span className="font-semibold">{enabled ? "On" : "Off"}</span>
    </button>
  );
}
