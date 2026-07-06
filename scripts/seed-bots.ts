// One-off seed script: populates the leaderboard with bot countries since
// there are no real players yet. Run once against the live project:
//
//   node --env-file=.env.local --experimental-strip-types scripts/seed-bots.ts
//
// Bots are plain `countries` rows with user_id=null, is_bot=true - no
// sector_state, no auth account. Their GDP then slowly drifts upward via
// drift_bots_if_due() (0007_bots_and_leaderboard.sql), piggybacked on
// get_leaderboard() reads.

import { createAdminClient } from "../lib/supabase/admin";
import { REAL_WORLD_COUNTRIES } from "../lib/game/countries";

const BOT_COUNT = 80;
// Hard cap enforced again in drift_bots_if_due() (8,000,000,000) - seeding
// under that with headroom so drift has room to move bots without any of
// them starting past the cap.
const GDP_BUCKETS: { weight: number; min: number; max: number }[] = [
  { weight: 0.4, min: 0, max: 100_000_000 }, // Bronze
  { weight: 0.3, min: 100_000_000, max: 1_000_000_000 }, // Silver
  { weight: 0.25, min: 1_000_000_000, max: 3_000_000_000 }, // Gold (low)
  { weight: 0.05, min: 3_000_000_000, max: 7_000_000_000 }, // Gold (high, near cap)
];

const USERNAME_PREFIXES = [
  "Iron", "Golden", "Silver", "Crimson", "Northern", "Southern", "Eastern",
  "Western", "Grand", "High", "Free", "United", "New", "Old", "Royal",
  "Silent", "Swift", "Bold", "Prime", "Astral",
];
const USERNAME_NOUNS = [
  "Eagle", "Falcon", "Wolf", "Lion", "Bear", "Hawk", "Tiger", "Fox",
  "Stag", "Raven", "Dragon", "Phoenix", "Panther", "Cobra", "Comet",
  "Voyager", "Pioneer", "Sentinel", "Warden", "Nomad",
];

function pickWeightedBucket() {
  const roll = Math.random();
  let cumulative = 0;
  for (const bucket of GDP_BUCKETS) {
    cumulative += bucket.weight;
    if (roll <= cumulative) return bucket;
  }
  return GDP_BUCKETS[0];
}

function randomUsername(index: number): string {
  const prefix = USERNAME_PREFIXES[index % USERNAME_PREFIXES.length];
  const noun = USERNAME_NOUNS[Math.floor(index / USERNAME_PREFIXES.length) % USERNAME_NOUNS.length];
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${prefix}${noun}${suffix}`;
}

async function main() {
  const supabase = createAdminClient();

  const shuffledCountries = [...REAL_WORLD_COUNTRIES].sort(() => Math.random() - 0.5);

  const bots = Array.from({ length: BOT_COUNT }, (_, i) => {
    const country = shuffledCountries[i % shuffledCountries.length];
    const bucket = pickWeightedBucket();
    const gdp = bucket.min + Math.random() * (bucket.max - bucket.min);

    return {
      user_id: null,
      is_bot: true,
      name: country.name,
      username: randomUsername(i),
      flag_emoji: country.flagEmoji,
      country_code: country.iso2,
      gdp: Number(gdp.toFixed(3)),
      gdp_per_sec: 0,
      treasury: 0,
      treasury_regen_per_sec: 0,
      credits: 0,
    };
  });

  const { error, count } = await supabase
    .from("countries")
    .insert(bots, { count: "exact" });

  if (error) {
    console.error("Failed to seed bots:", error);
    process.exit(1);
  }

  console.log(`Seeded ${count ?? bots.length} bot countries.`);
}

main();
