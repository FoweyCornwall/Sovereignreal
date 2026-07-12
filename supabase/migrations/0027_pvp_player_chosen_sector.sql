-- Direct user ask: the acting player picks which sector gets revealed each
-- round, instead of the server picking one at random (0022's model). The
-- win condition itself is untouched - first to 5 round-wins takes the match
-- immediately (pvp_advance_or_finalize), and if nobody reaches 5 before all
-- 10 sectors are used, whoever has more round-wins takes it
-- (pvp_finalize_match) - that was already exactly this, only how the
-- sector gets chosen changes here.

drop function if exists submit_attack(uuid, uuid);
drop function if exists pvp_resolve_round(uuid, text);

-- ---------------------------------------------------------------------------
-- pvp_resolve_round now takes the sector directly instead of picking one at
-- random. Caller (submit_attack for humans, pvp_play_bot_turn for bots) is
-- responsible for choosing an unused sector - both run inside the same
-- locked, single-threaded-per-match flow, so no extra validation race is
-- possible here.
-- ---------------------------------------------------------------------------

create or replace function pvp_resolve_round(p_match_id uuid, p_acting_side text, p_sector text)
returns jsonb
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_side_a_score numeric;
  v_side_b_score numeric;
  v_winner_side text;
begin
  select * into v_match from pvp_matches where id = p_match_id for update;

  select coalesce(score, 0) into v_side_a_score from sector_state
    where country_id = v_match.side_a_country_id and sector = p_sector;
  select coalesce(score, 0) into v_side_b_score from sector_state
    where country_id = v_match.side_b_country_id and sector = p_sector;

  if v_side_a_score > v_side_b_score then
    v_winner_side := 'a';
  elsif v_side_b_score > v_side_a_score then
    v_winner_side := 'b';
  else
    v_winner_side := case when random() < 0.5 then 'a' else 'b' end;
  end if;

  insert into pvp_match_events (
    match_id, turn_number, event_type, target_sector, side_a_score, side_b_score, winner_side
  ) values (
    p_match_id, v_match.turn_number, 'round', p_sector, v_side_a_score, v_side_b_score, v_winner_side
  );

  if v_winner_side = 'a' then
    update pvp_matches set side_a_wins = side_a_wins + 1 where id = p_match_id;
  else
    update pvp_matches set side_b_wins = side_b_wins + 1 where id = p_match_id;
  end if;

  perform pvp_advance_or_finalize(p_match_id, p_acting_side);

  return jsonb_build_object(
    'ok', true, 'targetSector', p_sector,
    'sideAScore', v_side_a_score, 'sideBScore', v_side_b_score, 'winnerSide', v_winner_side
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Bot sector choice: no human to pick, so the bot needs its own heuristic.
-- 85% of the time it targets the unused sector where it has the biggest
-- score edge over the opponent (best win odds); 15% of the time it picks a
-- uniformly random unused sector instead, so a human can't perfectly read
-- the bot's play every match. Same "mostly-optimal, occasionally random"
-- shape already used for bot AI earlier in this project.
-- ---------------------------------------------------------------------------

create or replace function pvp_play_bot_turn(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match pvp_matches%rowtype;
  v_sector text;
begin
  select * into v_match from pvp_matches where id = p_match_id;

  if random() < 0.85 then
    select s.sector into v_sector
    from unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ]) as s(sector)
    left join sector_state bot_ss
      on bot_ss.country_id = v_match.side_b_country_id and bot_ss.sector = s.sector
    left join sector_state opp_ss
      on opp_ss.country_id = v_match.side_a_country_id and opp_ss.sector = s.sector
    where s.sector not in (
      select target_sector from pvp_match_events
      where match_id = p_match_id and target_sector is not null
    )
    order by coalesce(bot_ss.score, 0) - coalesce(opp_ss.score, 0) desc, random()
    limit 1;
  else
    select s.sector into v_sector
    from unnest(array[
      'economy', 'social', 'safety', 'innovation', 'productivity',
      'infrastructure', 'environment', 'immigration', 'housing', 'culture'
    ]) as s(sector)
    where s.sector not in (
      select target_sector from pvp_match_events
      where match_id = p_match_id and target_sector is not null
    )
    order by random()
    limit 1;
  end if;

  perform pvp_resolve_round(p_match_id, 'b', v_sector);
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_attack: now takes p_sector and validates it before resolving -
-- must be one of the 10 real sector keys and not already revealed this
-- match.
-- ---------------------------------------------------------------------------

create or replace function submit_attack(p_match_id uuid, p_country_id uuid, p_sector text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_match pvp_matches%rowtype;
  v_side text;
  v_round_result jsonb;
begin
  select user_id into v_owner from countries where id = p_country_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  select * into v_match from pvp_matches where id = p_match_id;
  if p_country_id <> v_match.side_a_country_id and p_country_id <> v_match.side_b_country_id then
    raise exception 'not authorized';
  end if;

  perform pvp_catch_up_timeouts(p_match_id);
  select * into v_match from pvp_matches where id = p_match_id;

  if v_match.status <> 'active' then
    return jsonb_build_object('ok', true) || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if v_match.current_turn_country_id <> p_country_id then
    return jsonb_build_object('ok', false, 'reason', 'NOT_YOUR_TURN')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if p_sector not in (
    'economy', 'social', 'safety', 'innovation', 'productivity',
    'infrastructure', 'environment', 'immigration', 'housing', 'culture'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SECTOR')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  if exists (
    select 1 from pvp_match_events
    where match_id = p_match_id and target_sector = p_sector
  ) then
    return jsonb_build_object('ok', false, 'reason', 'SECTOR_ALREADY_USED')
      || pvp_get_match_state(p_match_id, p_country_id);
  end if;

  v_side := case when p_country_id = v_match.side_a_country_id then 'a' else 'b' end;
  v_round_result := pvp_resolve_round(p_match_id, v_side, p_sector);

  return jsonb_build_object('ok', true, 'roundResult', v_round_result)
    || pvp_get_match_state(p_match_id, p_country_id);
end;
$$;

grant execute on function submit_attack(uuid, uuid, text) to authenticated;
