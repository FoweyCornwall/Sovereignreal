-- Phase 2: username identity, credits currency, and schema flags needed for
-- bot countries (no real auth account). See the Phase 2 plan doc for
-- rationale.

-- ---------------------------------------------------------------------------
-- Username identity
-- ---------------------------------------------------------------------------

alter table profiles add column username text unique;

-- Denormalized copy on countries so leaderboard reads need no join, and so
-- bot countries (which have no profiles row at all) work uniformly.
alter table countries add column username text;

create or replace function is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from profiles where username = p_username);
$$;

grant execute on function is_username_available(text) to authenticated, anon;

-- Rewritten to also capture the username supplied at signup (passed via
-- supabase.auth.signUp({ options: { data: { username } } })).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

-- Keeps countries.username in sync when a player edits their username later
-- from Settings. (Initial denormalization at country-creation time is done
-- by the createCountry server action itself, since no countries row exists
-- yet when handle_new_user first fires.)
create or replace function public.sync_username_to_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update countries set username = new.username where user_id = new.id;
  return new;
end;
$$;

create trigger on_profile_username_updated
  after update of username on profiles
  for each row execute function public.sync_username_to_country();

-- ---------------------------------------------------------------------------
-- Credits (premium currency, real-money top-up only)
-- ---------------------------------------------------------------------------

alter table countries add column credits integer not null default 20 check (credits >= 0);

-- ---------------------------------------------------------------------------
-- Bot support: countries rows without a real auth.users account
-- ---------------------------------------------------------------------------

alter table countries add column is_bot boolean not null default false;

alter table countries alter column user_id drop not null;
alter table countries drop constraint countries_user_id_key;
create unique index countries_user_id_unique_idx on countries (user_id) where user_id is not null;
