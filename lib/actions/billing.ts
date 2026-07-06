"use server";

import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { getCreditPack } from "@/lib/billing/creditPacks";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
