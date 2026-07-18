import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/billing/stripe";

// Shared idempotent grant path. Called from two places:
//   1. The Stripe webhook handler, on checkout.session.completed events.
//   2. The Restore Purchases action, when a user's paid session never
//      got webhook-delivered (or the delivery failed).
// Both call this with the same session shape. Idempotency is enforced by
// credit_purchases.stripe_session_id being unique - a duplicate call is
// a no-op (upsert returns 0 rows).

export type GrantOutcome =
  | { kind: "credit_pack"; credits: number }
  | { kind: "vip_lifetime" }
  | { kind: "vip_subscription"; periodEnd: string }
  | { kind: "already_applied" }
  | { kind: "unknown"; reason: string };

function getCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const topLevel = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof topLevel === "number") return topLevel;
  const itemLevel = subscription.items.data[0] as unknown as {
    current_period_end?: number;
  };
  return typeof itemLevel?.current_period_end === "number" ? itemLevel.current_period_end : null;
}

export async function applyStripeSessionGrant(
  session: Stripe.Checkout.Session
): Promise<GrantOutcome> {
  const admin = createAdminClient();
  const metadata = (session.metadata ?? {}) as Record<string, string | undefined>;

  // Lifetime VIP: one-time payment, sets vip_expires_at to year 2999.
  if (session.mode === "payment" && metadata.kind === "vip_lifetime") {
    const userId = metadata.user_id;
    if (!userId) return { kind: "unknown", reason: "missing user_id in vip_lifetime metadata" };

    const { data: country } = await admin
      .from("countries")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!country?.id) return { kind: "unknown", reason: "no country for vip_lifetime user" };

    const { data: inserted, error } = await admin
      .from("credit_purchases")
      .upsert(
        {
          country_id: country.id,
          stripe_session_id: session.id,
          pack_key: "vip_lifetime",
          credits_granted: 0,
          amount_cents: session.amount_total ?? 0,
        },
        { onConflict: "stripe_session_id", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw new Error(`credit_purchases upsert failed: ${error.message}`);
    if (!inserted || inserted.length === 0) return { kind: "already_applied" };

    const { error: profileError } = await admin
      .from("profiles")
      .update({ vip_expires_at: "2999-12-31T00:00:00Z" })
      .eq("id", userId);
    if (profileError) throw new Error(`profiles vip update failed: ${profileError.message}`);

    return { kind: "vip_lifetime" };
  }

  // VIP subscription: initial checkout completion.
  if (session.mode === "subscription" && metadata.kind === "vip") {
    const userId = metadata.user_id;
    if (!userId || !session.subscription) {
      return { kind: "unknown", reason: "missing user_id or subscription id" };
    }

    const stripe = getStripeClient();
    const subId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
    const subscription = await stripe.subscriptions.retrieve(subId);
    const periodEnd = getCurrentPeriodEnd(subscription);
    if (!periodEnd) return { kind: "unknown", reason: "no current_period_end on subscription" };

    const iso = new Date(periodEnd * 1000).toISOString();
    const customerId = typeof session.customer === "string" ? session.customer : null;

    const { error } = await admin
      .from("profiles")
      .update({
        vip_expires_at: iso,
        stripe_customer_id: customerId,
        stripe_subscription_id: subId,
      })
      .eq("id", userId);
    if (error) throw new Error(`profiles vip subscription update failed: ${error.message}`);

    return { kind: "vip_subscription", periodEnd: iso };
  }

  // Credit pack.
  const countryId = metadata.country_id;
  const packKey = metadata.pack_key;
  const credits = Number(metadata.credits ?? 0);
  if (countryId && packKey && credits > 0) {
    const { data: inserted, error } = await admin
      .from("credit_purchases")
      .upsert(
        {
          country_id: countryId,
          stripe_session_id: session.id,
          pack_key: packKey,
          credits_granted: credits,
          amount_cents: session.amount_total ?? 0,
        },
        { onConflict: "stripe_session_id", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw new Error(`credit_purchases upsert failed: ${error.message}`);
    if (!inserted || inserted.length === 0) return { kind: "already_applied" };

    const { data: country } = await admin
      .from("countries")
      .select("user_id")
      .eq("id", countryId)
      .single();
    if (!country?.user_id) throw new Error(`country ${countryId} has no user_id`);

    const { data: profile } = await admin
      .from("profiles")
      .select("credits")
      .eq("id", country.user_id)
      .single();
    const { error: bumpError } = await admin
      .from("profiles")
      .update({ credits: (profile?.credits ?? 0) + credits })
      .eq("id", country.user_id);
    if (bumpError) throw new Error(`profiles credits bump failed: ${bumpError.message}`);

    return { kind: "credit_pack", credits };
  }

  return { kind: "unknown", reason: "no matching grant path" };
}
