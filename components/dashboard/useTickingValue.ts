"use client";

import { useEffect, useState } from "react";
import { interpolateValue } from "@/lib/game/gdp";

// Visual-only per-second ticking counter (e.g. GDP, treasury). Resets its
// baseline whenever `baseValue`/`perSecondRate` change (a fresh settle from
// the server) so it never drifts far from the authoritative value. There can
// be up to a ~1s lag before a prop change is reflected, since the tick is
// only applied from inside the interval callback (not synchronously in the
// effect body) - a deliberate tradeoff to keep this a pure, lint-clean effect.
export function useTickingValue(baseValue: number, perSecondRate: number): number {
  const [displayed, setDisplayed] = useState(baseValue);

  useEffect(() => {
    const fetchedAt = Date.now();
    const interval = setInterval(() => {
      setDisplayed(interpolateValue(baseValue, perSecondRate, fetchedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [baseValue, perSecondRate]);

  return displayed;
}
