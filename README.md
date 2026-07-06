# Sovereign

An endless nation-building strategy web game. Manage a government budget,
enact policies with real tradeoffs, and chase the highest GDP on the global
leaderboard.

This is the MVP core loop: Country Setup, Dashboard, Policy Deck &
Enactment, Active Policies Queue, Budget Management, Global Leaderboard, and
Stats & History. World events, mutations, VIP/monetization, and sound/
animation polish are deliberately out of scope for this pass.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, backed by Supabase
(Postgres + Auth + RLS). Policy timers and budget regeneration use a
lazy-settle pattern (see `settle_country()` in
`supabase/migrations/0001_init.sql`) so they keep progressing even while the
app is closed.

## Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/` against it, in order, via
   the Supabase SQL editor or `supabase db push` (if using the CLI with the
   project linked).
3. Copy `.env.local.example` to `.env.local` and fill in your project's URL,
   anon key, and service role key (Project Settings → API).
4. `npm install`
5. `npm run dev` and open [http://localhost:3000](http://localhost:3000).

## Project layout

- `app/(auth)/` — sign up / log in.
- `app/(game)/` — the authenticated game shell and its 7 core pages.
- `lib/game/` — domain logic: GDP/trend math, formatting, constants, seed
  country list.
- `lib/actions/` — server actions (country setup, policy enactment, auth,
  settings).
- `supabase/migrations/` — schema, RLS policies, and the
  `settle_country` / `enact_policy` / `get_leaderboard` / `get_my_rank`
  Postgres functions.
