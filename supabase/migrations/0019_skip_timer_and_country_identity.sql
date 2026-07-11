-- Two independent additions:
-- 1. skip_active_policy(): the "Skip Timer" button in the Active Policies
--    Queue (replaces the old disabled "Speed Up (Coming Soon)" placeholder)
--    - pay 5 credits, forces that one active_policies row to complete
--    immediately by nudging completes_at to now(); the very next
--    settle_country() call (already run on every relevant page load)
--    resolves it through the existing settlement machinery.
-- 2. countries.identity_updated_at + update_country_identity(): lets a
--    player change name/flag/country without a full delete & restart. Free,
--    rate-limited to once per 24h to deter leaderboard flag-flipping abuse.

alter table countries add column identity_updated_at timestamptz;

create or replace function skip_active_policy(p_active_policy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_credits int;
  v_country_id uuid;
  v_settled boolean;
begin
  select ap.country_id, c.user_id, ap.settled
    into v_country_id, v_owner, v_settled
    from active_policies ap
    join countries c on c.id = ap.country_id
    where ap.id = p_active_policy_id
    for update of ap;

  if v_country_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_settled then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_DUE');
  end if;

  select credits into v_credits from profiles where id = v_owner for update;

  if v_credits < 5 then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_CREDITS', 'shortfall', 5 - v_credits);
  end if;

  update profiles set credits = credits - 5 where id = v_owner;
  update active_policies set completes_at = now() where id = p_active_policy_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function skip_active_policy(uuid) to authenticated;

create or replace function update_country_identity(
  p_country_id uuid,
  p_name text,
  p_flag_emoji text,
  p_flag_style jsonb,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_last timestamptz;
begin
  select user_id, identity_updated_at into v_owner, v_last
    from countries where id = p_country_id for update;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if v_last is not null and v_last > now() - interval '24 hours' then
    return jsonb_build_object(
      'ok', false, 'reason', 'ON_COOLDOWN',
      'retry_at', v_last + interval '24 hours'
    );
  end if;

  update countries
    set name = p_name,
        flag_emoji = p_flag_emoji,
        flag_style = p_flag_style,
        country_code = p_country_code,
        identity_updated_at = now()
    where id = p_country_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function update_country_identity(uuid, text, text, jsonb, text) to authenticated;
