-- Audit log for every incoming Stripe webhook. Every event we receive
-- gets a row here, whether it succeeds or blows up. Two purposes:
--   1. When a customer reports "I paid but nothing loaded", we can look
--      up their user_id and see whether Stripe even reached us.
--   2. Idempotency: unique on stripe_event_id means at-least-once
--      retries from Stripe can't cause duplicate grants.

create table if not exists stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  status text not null check (status in ('success', 'error', 'skipped')),
  error_text text,
  session_id text,
  user_id uuid
);

create index if not exists stripe_webhook_events_received_at_idx
  on stripe_webhook_events (received_at desc);
create index if not exists stripe_webhook_events_user_id_idx
  on stripe_webhook_events (user_id);

-- Service-role-only. Regular authenticated users never touch this table
-- directly - only the webhook route and admin restore action, both of
-- which use the service-role admin client.
alter table stripe_webhook_events enable row level security;
