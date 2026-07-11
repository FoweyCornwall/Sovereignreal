-- Sector-card skin packs: purely cosmetic, restyle a sector card's mutation
-- presentation (Ice / Fire) instead of the default rarity-colored glow.
-- Bought with credits, one-time purchase, equip/unequip freely afterward.

create table cosmetic_packs (
  key text primary key,
  name text not null,
  description text,
  price_credits integer not null check (price_credits >= 0),
  theme text not null check (theme in ('ice', 'fire'))
);

insert into cosmetic_packs (key, name, description, price_credits, theme) values
  ('ice_pack', 'Glacier Pack', 'Frost and ice effects on mutated sectors.', 250, 'ice'),
  ('fire_pack', 'Inferno Pack', 'Ember and flame effects on mutated sectors.', 250, 'fire');

alter table cosmetic_packs enable row level security;
create policy "cosmetic_packs public read" on cosmetic_packs
  for select using (auth.role() = 'authenticated');

create table user_cosmetics (
  user_id uuid not null references profiles (id) on delete cascade,
  pack_key text not null references cosmetic_packs (key),
  acquired_at timestamptz not null default now(),
  primary key (user_id, pack_key)
);

alter table user_cosmetics enable row level security;
create policy "own user_cosmetics read" on user_cosmetics
  for select using (auth.uid() = user_id);
-- No insert/update/delete policy for clients - only purchase_cosmetic_pack()
-- (security definer) writes here.

alter table profiles add column if not exists equipped_sector_theme text
  check (equipped_sector_theme in ('ice', 'fire'));

create or replace function purchase_cosmetic_pack(p_pack_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_price int;
  v_credits int;
  v_already_owned boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select price_credits into v_price from cosmetic_packs where key = p_pack_key;
  if v_price is null then
    return jsonb_build_object('ok', false, 'reason', 'PACK_NOT_FOUND');
  end if;

  select exists(
    select 1 from user_cosmetics where user_id = v_user and pack_key = p_pack_key
  ) into v_already_owned;
  if v_already_owned then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_OWNED');
  end if;

  select credits into v_credits from profiles where id = v_user for update;
  if v_credits < v_price then
    return jsonb_build_object('ok', false, 'reason', 'INSUFFICIENT_CREDITS', 'shortfall', v_price - v_credits);
  end if;

  update profiles set credits = credits - v_price where id = v_user;
  insert into user_cosmetics (user_id, pack_key) values (v_user, p_pack_key);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function purchase_cosmetic_pack(text) to authenticated;

create or replace function equip_sector_theme(p_theme text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pack_key text;
  v_owned boolean;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  if p_theme is not null then
    select key into v_pack_key from cosmetic_packs where theme = p_theme;
    if v_pack_key is null then
      return jsonb_build_object('ok', false, 'reason', 'THEME_NOT_FOUND');
    end if;

    select exists(
      select 1 from user_cosmetics where user_id = v_user and pack_key = v_pack_key
    ) into v_owned;
    if not v_owned then
      return jsonb_build_object('ok', false, 'reason', 'NOT_OWNED');
    end if;
  end if;

  update profiles set equipped_sector_theme = p_theme where id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function equip_sector_theme(text) to authenticated;
