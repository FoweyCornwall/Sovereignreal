"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SETTLE_POLL_INTERVAL_MS } from "@/lib/game/constants";

// Periodically re-runs the enclosing server component (which re-invokes
// loadGameState() -> settle_country()), so pages stay live without a manual
// reload while open.
export function usePollingRefresh(intervalMs: number = SETTLE_POLL_INTERVAL_MS) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs]);
}
