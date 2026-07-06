import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Service-role client. Server-only, for one-off scripts (e.g. seeding) —
// bypasses RLS entirely, so don't import it into request-handling code
// (route handlers, server actions, components) except the one sanctioned
// case: app/api/stripe/webhook/route.ts, where there's no user session to
// authenticate a server-to-server Stripe call against.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
