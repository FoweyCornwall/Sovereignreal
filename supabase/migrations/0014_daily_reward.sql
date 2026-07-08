-- Flat 5-credit daily sign-in reward. Idempotent per UTC calendar day
-- via a single timestamp column on the profile row - no separate table
-- needed, and no cron: the app calls the RPC when the user clicks the
-- Dashboard chip.

alter table profiles add column if not exists last_daily_claim_at timestamptz;

create or replace function claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_today date := (now() at time zone 'UTC')::date;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select last_daily_claim_at into v_last from profiles where id = v_user for update;

  if v_last is not null and (v_last at time zone 'UTC')::date >= v_today then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_CLAIMED');
  end if;

  update profiles
    set credits = credits + 5,
        last_daily_claim_at = now()
    where id = v_user;

  return jsonb_build_object('ok', true, 'credits_granted', 5);
end;
$$;

grant execute on function claim_daily_reward() to authenticated;
