"use client";

import { useState } from "react";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

// Server component's `hasSeen` value is the initial gate; local state
// hides the tour immediately on dismiss without waiting for the layout
// to re-fetch (router.refresh() in the tour still triggers, so the flag
// is persisted, but the UI is instant).
export function OnboardingMount({ hasSeen }: { hasSeen: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (hasSeen || dismissed) return null;
  return <OnboardingTour onDismiss={() => setDismissed(true)} />;
}
