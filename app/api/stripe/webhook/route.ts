import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStripeSessionGrant } from "@/lib/billing/apply";
import type Stripe from "stripe";

export const runtime = "nodejs";

// Stripe moved current_period_end from the top-level Subscription object
// onto each SubscriptionItem in newer API versions. Check both.
function getCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const topLevel = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof topLevel === "number") return topLevel;
  const itemLevel = subscription.items.data[0] as unknown as {
    current_period_end?: number;
  };
  return typeof itemLevel?.current_period_end === "number" ? itemLevel.current_period_end : null;
}

// Every webhook we receive gets a row in stripe_webhook_events. Two
// benefits: (1) audit trail for "I paid but nothing loaded" reports,
// (2) unique on stripe_event_id gives us hard idempotency against
// Stripe's at-least-once retry semantics.
async function logEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  eventType: string,
  status: "success" | "error" | "skipped",
  extras: { errorText?: string; sessionId?: string; userId?: string } = {}
) {
  try {
    await admin.from("stripe_webhook_events").upsert(
      {
        stripe_event_id: eventId,
        event_type: eventType,
        status,
        error_text: extras.errorText ?? null,
        session_id: extras.sessionId ?? null,
        user_id: extras.userId ?? null,
      },
      { onConflict: "stripe_event_id", ignoreDuplicates: true }
    );
  } catch {
    // Audit-log failure must never break the actual grant. Swallow.
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = (session.metadata as { user_id?: string } | null)?.user_id;

    try {
      const outcome = await applyStripeSessionGrant(session);
      await logEvent(admin, event.id, event.type, "success", {
        sessionId: session.id,
        userId,
        errorText: outcome.kind === "unknown" ? outcome.reason : undefined,
      });
      return NextResponse.json({ received: true, outcome: outcome.kind });
    } catch (err) {
      const errorText = (err as Error).message;
      await logEvent(admin, event.id, event.type, "error", {
        sessionId: session.id,
        userId,
        errorText,
      });
      // Return 500 so Stripe retries the delivery. Silent .update()
      // errors used to swallow this and make Stripe think we succeeded.
      return NextResponse.json({ error: errorText }, { status: 500 });
    }
  }

  // Subscription renewal.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as { subscription: string | null };

    try {
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const currentPeriodEnd = getCurrentPeriodEnd(subscription);

        if (currentPeriodEnd) {
          const { error } = await admin
            .from("profiles")
            .update({ vip_expires_at: new Date(currentPeriodEnd * 1000).toISOString() })
            .eq("stripe_subscription_id", invoice.subscription);
          if (error) throw new Error(error.message);
        }
      }
      await logEvent(admin, event.id, event.type, "success");
      return NextResponse.json({ received: true });
    } catch (err) {
      const errorText = (err as Error).message;
      await logEvent(admin, event.id, event.type, "error", { errorText });
      return NextResponse.json({ error: errorText }, { status: 500 });
    }
  }

  await logEvent(admin, event.id, event.type, "skipped");
  return NextResponse.json({ received: true });
}
