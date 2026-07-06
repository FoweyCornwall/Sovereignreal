-- Phase 2: credit_purchases tracks Stripe Checkout sessions so the webhook
-- can grant credits exactly once even under Stripe's at-least-once retry
-- delivery (insert ... on conflict (stripe_session_id) do nothing - a
-- no-op insert means "already processed," skip granting again).

create table credit_purchases (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries (id) on delete cascade,
  stripe_session_id text unique not null,
  pack_key text not null,
  credits_granted integer not null,
  amount_cents integer not null,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

alter table credit_purchases enable row level security;
create policy "own credit_purchases read" on credit_purchases
  for select using (
    exists (select 1 from countries c where c.id = credit_purchases.country_id and c.user_id = auth.uid())
  );

-- No insert/update/delete policy for normal users - only the webhook
-- (service-role client) writes to this table.
