"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { getCreditPack } from "@/lib/billing/creditPacks";
import { applyStripeSessionGrant, type GrantOutcome } from "@/lib/billing/apply";
import { VIP_LIFETIME_PRICE_CENTS, VIP_PRICE_CENTS } from "@/lib/game/vip";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function createCheckoutSession(packKey: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: country } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!country) {
    redirect("/setup");
  }

  const pack = getCreditPack(packKey);
  if (!pack) {
    throw new Error(`Unknown credit pack: ${packKey}`);
  }

  const siteUrl = await getSiteUrl();
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: pack.label },
          unit_amount: pack.priceCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      country_id: country.id,
      pack_key: pack.key,
      credits: String(pack.credits),
    },
    success_url: `${siteUrl}/settings?purchase=success`,
    cancel_url: `${siteUrl}/settings?purchase=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}

export async function createVipLifetimeCheckoutSession() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const siteUrl = await getSiteUrl();
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Sovereign VIP — Lifetime" },
          unit_amount: VIP_LIFETIME_PRICE_CENTS,
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "vip_lifetime",
      user_id: userData.user.id,
    },
    success_url: `${siteUrl}/settings?vip=success`,
    cancel_url: `${siteUrl}/settings?vip=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}

export async function createVipCheckoutSession() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const siteUrl = await getSiteUrl();
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Sovereign VIP" },
          unit_amount: VIP_PRICE_CENTS,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "vip",
      user_id: userData.user.id,
    },
    success_url: `${siteUrl}/settings?vip=success`,
    cancel_url: `${siteUrl}/settings?vip=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(session.url);
}

export type RestorePurchasesResult = {
  restored: number;
  alreadySynced: number;
  errors: string[];
};

// Manual recovery path for the case where Stripe accepted a payment but
// the webhook never delivered (bad endpoint URL, wrong signing secret,
// server transient). Lists the user's recent Stripe checkout sessions,
// filters to paid ones tagged with their user_id, and re-applies any
// grant that isn't already recorded in credit_purchases. Fully
// idempotent so re-clicks are safe.
export async function restoreMyPurchases(): Promise<RestorePurchasesResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/login");
  }
  const userId = userData.user.id;

  const stripe = getStripeClient();
  const result: RestorePurchasesResult = { restored: 0, alreadySynced: 0, errors: [] };

  const list = await stripe.checkout.sessions.list({ limit: 100 });
  for (const session of list.data) {
    const meta = (session.metadata ?? {}) as { user_id?: string };
    if (meta.user_id !== userId) continue;
    if (session.payment_status !== "paid" && session.status !== "complete") continue;

    try {
      const outcome: GrantOutcome = await applyStripeSessionGrant(session);
      if (outcome.kind === "already_applied") {
        result.alreadySynced += 1;
      } else if (outcome.kind === "unknown") {
        result.errors.push(`${session.id}: ${outcome.reason}`);
      } else {
        result.restored += 1;
      }
    } catch (err) {
      result.errors.push(`${session.id}: ${(err as Error).message}`);
    }
  }

  if (result.restored > 0) {
    revalidatePath("/", "layout");
  }

  return result;
}
