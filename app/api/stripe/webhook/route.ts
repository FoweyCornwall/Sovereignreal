import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      metadata: { country_id?: string; pack_key?: string; credits?: string } | null;
      amount_total: number | null;
    };

    const countryId = session.metadata?.country_id;
    const packKey = session.metadata?.pack_key;
    const credits = Number(session.metadata?.credits ?? 0);

    if (countryId && packKey && credits > 0) {
      // Service-role client - a deliberate, narrow exception (see
      // lib/supabase/admin.ts): there is no user session for a
      // server-to-server Stripe webhook call.
      const admin = createAdminClient();

      // Idempotency: ON CONFLICT DO NOTHING on stripe_session_id - a no-op
      // upsert (0 rows returned) means this session was already processed,
      // so skip granting credits again. Stripe retries webhook delivery
      // at-least-once.
      const { data: inserted, error: insertError } = await admin
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

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      if (inserted && inserted.length > 0) {
        // Credits live on profiles (not countries) so they survive
        // Delete & Restart. Look up the owning user via the country.
        const { data: country } = await admin
          .from("countries")
          .select("user_id")
          .eq("id", countryId)
          .single();

        if (country?.user_id) {
          const { data: profile } = await admin
            .from("profiles")
            .select("credits")
            .eq("id", country.user_id)
            .single();

          await admin
            .from("profiles")
            .update({ credits: (profile?.credits ?? 0) + credits })
            .eq("id", country.user_id);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
