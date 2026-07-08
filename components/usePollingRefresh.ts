"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SETTLE_POLL_INTERVAL_MS } from "@/lib/game/constants";

// Periodically re-runs the enclosing server component (which re-invokes
// loadGameState() -> settle_country()), so pages stay live without a manual
// reload while open. Paused while the tab is hidden so a background tab
// isn't burning server round-trips (that showed up as sluggish nav for the
// user).
export function usePollingRefresh(intervalMs: number = SETTLE_POLL_INTERVAL_MS) {
  const router = useRouter();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (interval !== null) return;
      interval = setInterval(() => router.refresh(), intervalMs);
    }
    function stop() {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        // Catch up on any elapsed time immediately, then resume the loop.
        router.refresh();
        start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [router, intervalMs]);
}
