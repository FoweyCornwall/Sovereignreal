-- First-time onboarding tour: flips to true after the player sees the
-- 5-slide walkthrough or clicks Skip. Defaults to false so every
-- existing account also sees the tour once. Player can replay it from
-- Settings ("Replay Tutorial" button flips it back to false).

alter table profiles
  add column if not exists has_seen_onboarding boolean not null default false;
