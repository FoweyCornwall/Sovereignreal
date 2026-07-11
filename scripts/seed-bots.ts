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
// Rebalanced to skew meaningfully stronger (~60% Platinum+ vs ~25% before)
// so bots read as a genuinely active, competitive playerbase both on the
// leaderboard and as PvP opponents (their sector_state is seeded off this
// same rank tier - see pvp_ensure_bot_sector_state() in
// 0021_pvp_siege.sql). Grandmaster's max is widened to 300T (still >3x
// short of the Transcendent threshold at 1e15) so the single highest bot
// never reaches the very top tier - keeps #1 on the leaderboard feeling
// reachable for a real player.
const GDP_BUCKETS: { weight: number; min: number; max: number }[] = [
  { weight: 0.08, min: 0, max: 100_000_000 }, // Bronze
  { weight: 0.12, min: 100_000_000, max: 1_000_000_000 }, // Silver
  { weight: 0.20, min: 1_000_000_000, max: 10_000_000_000 }, // Gold
  { weight: 0.25, min: 10_000_000_000, max: 100_000_000_000 }, // Platinum
  { weight: 0.20, min: 100_000_000_000, max: 1_000_000_000_000 }, // Diamond
  { weight: 0.12, min: 1_000_000_000_000, max: 10_000_000_000_000 }, // Master
  { weight: 0.03, min: 10_000_000_000_000, max: 300_000_000_000_000 }, // Grandmaster
];

// Human-shaped usernames: mostly a short handle + a small number, sometimes
// just a handle, sometimes with a common separator. No consistent prefix +
// noun + 3-digit-suffix pattern that visibly reads as bot-generated.
const HANDLE_PARTS_A = [
  "alex", "sam", "jordan", "riley", "casey", "avery", "morgan", "taylor",
  "quinn", "reese", "kai", "leo", "milo", "arlo", "juno", "nova", "sage",
  "wren", "eli", "finn", "mira", "iris", "cal", "ren", "noor", "sol",
  "yuki", "aki", "tomo", "yuri", "dima", "kira", "luca", "theo", "ivo",
  "nils", "lena", "anya", "elin", "maya", "zara", "aria", "iona", "mateo",
  "dax", "jax", "ash", "rue", "cora", "ezra",
];
const HANDLE_PARTS_B = [
  "", "", "", "", "", // blanks so ~40% are single-part
  "wave", "sky", "star", "moon", "sun", "river", "storm", "rain",
  "vale", "peak", "glass", "iron", "pine", "oak", "reed", "haze",
];
const SEPARATORS = ["", "", "", "", "_", ".", "-"];

function randomUsername(): string {
  const a = HANDLE_PARTS_A[Math.floor(Math.random() * HANDLE_PARTS_A.length)];
  const b = HANDLE_PARTS_B[Math.floor(Math.random() * HANDLE_PARTS_B.length)];
  const sep = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
  const numChance = Math.random();
  let num = "";
  if (numChance < 0.35) num = String(Math.floor(Math.random() * 99) + 1);
  else if (numChance < 0.55) num = String(Math.floor(Math.random() * 9000) + 1000);
  const core = b ? `${a}${sep}${b}` : a;
  return `${core}${num}`;
}

function pickWeightedBucket() {
  const roll = Math.random();
  let cumulative = 0;
  for (const bucket of GDP_BUCKETS) {
    cumulative += bucket.weight;
    if (roll <= cumulative) return bucket;
  }
  return GDP_BUCKETS[0];
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
      username: randomUsername(),
      flag_emoji: country.flagEmoji,
      country_code: country.iso2,
      gdp: Number(gdp.toFixed(3)),
      gdp_per_sec: 0,
      treasury: 0,
      treasury_regen_per_sec: 0,
      // ~15% of bots show the VIP tag/gold outline for atmosphere - display
      // only, grants no actual perk (see 0017_vip.sql).
      is_vip_bot: Math.random() < 0.15,
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
