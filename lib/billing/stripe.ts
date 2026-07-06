import Stripe from "stripe";

// Constructed lazily (not at module scope) so pages that never touch
// billing don't break if Stripe keys are absent - only code paths that
// actually need Stripe pay the cost of a missing/invalid key.
export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set - credits purchases are unavailable until it's configured."
    );
  }
  return new Stripe(key);
}
