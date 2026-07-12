// One-off seed script: populates the leaderboard with bot countries since
// there are no real players yet. Run once against the live project:
//
//   node --env-file=.env.local --experimental-strip-types scripts/seed-bots.ts
//
// Bots are plain `countries` rows with user_id=null, is_bot=true. Their GDP
// then slowly drifts upward via drift_bots_if_due() (0007/0012), piggybacked
// on get_leaderboard() reads. Their sector_state (used for PvP defense) is
// seeded lazily the first time each bot is actually matched - see
// pvp_ensure_bot_sector_state() in 0021_pvp_siege.sql/0022_pvp_reveal_and_compare.sql.
//
// Two pools:
//   - VISIBLE: shown on the leaderboard (show_on_leaderboard=true), floored
//     at Diamond GDP per the product ask ("lowest bot on the leaderboard
//     should minimally be Diamond ranked").
//   - HIDDEN: show_on_leaderboard=false, spans the full Bronze-Diamond
//     range. These exist purely so new/weak players get fair PvP
//     opponents via the sector-strength-band matchmaking in
//     0022_pvp_reveal_and_compare.sql (find_match) - without them, a brand
//     new player would only ever be able to match against Diamond+ bots.

import { createAdminClient } from "../lib/supabase/admin";
import { REAL_WORLD_COUNTRIES } from "../lib/game/countries";

const VISIBLE_BOT_COUNT = 120;
const HIDDEN_BOT_COUNT = 150;

// Diamond floor, widened Grandmaster max (3e14, still >3x short of the 1e15
// Transcendent threshold) so the single highest bot never reaches the very
// top tier - keeps #1 on the leaderboard feeling reachable for a real
// player. VIP chance climbs with tier - "more bots in higher ranks have
// VIP status".
const VISIBLE_GDP_BUCKETS: { weight: number; min: number; max: number; vipChance: number }[] = [
  { weight: 0.45, min: 100_000_000_000, max: 1_000_000_000_000, vipChance: 0.2 }, // Diamond
  { weight: 0.4, min: 1_000_000_000_000, max: 10_000_000_000_000, vipChance: 0.4 }, // Master
  { weight: 0.15, min: 10_000_000_000_000, max: 300_000_000_000_000, vipChance: 0.65 }, // Grandmaster
];

// Full Bronze-Diamond spread, weighted toward weaker/mid so there's plenty
// of density for new and mid-progress players to match fairly against.
// Not shown on the leaderboard at all.
const HIDDEN_GDP_BUCKETS: { weight: number; min: number; max: number; vipChance: number }[] = [
  { weight: 0.3, min: 0, max: 100_000_000, vipChance: 0.05 }, // Bronze
  { weight: 0.25, min: 100_000_000, max: 1_000_000_000, vipChance: 0.05 }, // Silver
  { weight: 0.2, min: 1_000_000_000, max: 10_000_000_000, vipChance: 0.05 }, // Gold
  { weight: 0.15, min: 10_000_000_000, max: 100_000_000_000, vipChance: 0.1 }, // Platinum
  { weight: 0.1, min: 100_000_000_000, max: 1_000_000_000_000, vipChance: 0.1 }, // Diamond
];

// Roughly a quarter of all bots get a joke custom country instead of a
// real-world one - flag emoji + solid color, same picker used by players
// in Country Setup, no real ISO country_code.
const CUSTOM_COUNTRY_CHANCE = 0.25;

const CUSTOM_COUNTRY_NAMES = [
  "The United Snack Nations", "Republic of Nap Time", "Duchy of Bad Wifi",
  "Sock Drawer Federation", "Land of Perpetual Mondays",
  "Kingdom of Overdue Library Books", "Republic of Lost Chargers",
  "Duchy of Cold Coffee", "Nation of Almost Vegetarians",
  "Land of the Midnight Snack", "Federation of Procrastination",
  "Kingdom of Mismatched Socks", "Republic of Group Chat Silence",
  "Duchy of Autocorrect Fails", "Nation of Loading Screens",
  "Land of Forgotten Passwords", "Kingdom of Backseat Drivers",
  "Republic of Half-Finished Projects", "Federation of Snooze Buttons",
  "Duchy of Wrong Turn Avenue", "People's Republic of Left Socks",
  "Grand Duchy of Expired Coupons", "Nation of Unread Emails",
  "Kingdom of Low Battery", "Republic of Buffering",
];

const CUSTOM_FLAG_EMOJI = [
  "🏴", "🚩", "🎌", "⭐", "🌟", "🔶", "🔷", "🔺", "⚜️", "🦅",
  "🦁", "🐉", "⚓", "🗼", "🌊", "🍕", "🧦", "☕", "🐢", "🦆",
];

const CUSTOM_FLAG_COLORS = [
  "#1e3a8a", "#991b1b", "#166534", "#78350f", "#581c87",
  "#0f172a", "#b91c1c", "#065f46", "#92400e", "#312e81",
];

// Human-shaped usernames for real-world-country bots: mostly a short
// handle + a small number, sometimes just a handle, sometimes with a
// common separator. No consistent prefix + noun + 3-digit-suffix pattern
// that visibly reads as bot-generated.
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

// Funny usernames paired specifically with custom-country bots.
const FUNNY_USERNAMES = [
  "potato_overlord", "chaosgremlin", "npc_energy", "wifi_thief",
  "professional_napper", "just_here_for_snacks", "certified_disaster",
  "big_mood_energy", "send_help_pls", "not_a_bot_i_promise",
  "goblin_mode_on", "existential_dread", "chronically_online",
  "mildly_feral", "gremlin_supreme", "snack_diplomat", "couch_general",
  "wifi_password_thief", "tuesday_enjoyer", "unpaid_intern",
  "reply_all_villain", "certified_menace", "houseplant_killer",
  "lost_the_remote", "pretends_to_work",
];

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

function randomFunnyUsername(): string {
  const base = FUNNY_USERNAMES[Math.floor(Math.random() * FUNNY_USERNAMES.length)];
  return Math.random() < 0.3 ? `${base}${Math.floor(Math.random() * 99) + 1}` : base;
}

function pickWeightedBucket<T extends { weight: number }>(buckets: T[]): T {
  const roll = Math.random();
  let cumulative = 0;
  for (const bucket of buckets) {
    cumulative += bucket.weight;
    if (roll <= cumulative) return bucket;
  }
  return buckets[0];
}

function buildBot(
  buckets: { weight: number; min: number; max: number; vipChance: number }[],
  showOnLeaderboard: boolean,
  realWorldPool: (typeof REAL_WORLD_COUNTRIES)[number][],
  poolIndex: number
) {
  const bucket = pickWeightedBucket(buckets);
  const gdp = bucket.min + Math.random() * (bucket.max - bucket.min);
  const isCustom = Math.random() < CUSTOM_COUNTRY_CHANCE;

  const identity = isCustom
    ? {
        name: CUSTOM_COUNTRY_NAMES[Math.floor(Math.random() * CUSTOM_COUNTRY_NAMES.length)],
        flag_emoji: CUSTOM_FLAG_EMOJI[Math.floor(Math.random() * CUSTOM_FLAG_EMOJI.length)],
        flag_style: { bg: CUSTOM_FLAG_COLORS[Math.floor(Math.random() * CUSTOM_FLAG_COLORS.length)] },
        country_code: null as string | null,
        username: randomFunnyUsername(),
      }
    : {
        name: realWorldPool[poolIndex % realWorldPool.length].name,
        flag_emoji: realWorldPool[poolIndex % realWorldPool.length].flagEmoji,
        flag_style: null,
        country_code: realWorldPool[poolIndex % realWorldPool.length].iso2,
        username: randomUsername(),
      };

  return {
    user_id: null,
    is_bot: true,
    show_on_leaderboard: showOnLeaderboard,
    name: identity.name,
    username: identity.username,
    flag_emoji: identity.flag_emoji,
    flag_style: identity.flag_style,
    country_code: identity.country_code,
    gdp: Number(gdp.toFixed(3)),
    gdp_per_sec: 0,
    treasury: 0,
    treasury_regen_per_sec: 0,
    is_vip_bot: Math.random() < bucket.vipChance,
  };
}

async function main() {
  const supabase = createAdminClient();

  const shuffledCountries = [...REAL_WORLD_COUNTRIES].sort(() => Math.random() - 0.5);

  const visibleBots = Array.from({ length: VISIBLE_BOT_COUNT }, (_, i) =>
    buildBot(VISIBLE_GDP_BUCKETS, true, shuffledCountries, i)
  );
  const hiddenBots = Array.from({ length: HIDDEN_BOT_COUNT }, (_, i) =>
    buildBot(HIDDEN_GDP_BUCKETS, false, shuffledCountries, VISIBLE_BOT_COUNT + i)
  );

  const bots = [...visibleBots, ...hiddenBots];

  const { error, count } = await supabase
    .from("countries")
    .insert(bots, { count: "exact" });

  if (error) {
    console.error("Failed to seed bots:", error);
    process.exit(1);
  }

  console.log(
    `Seeded ${count ?? bots.length} bot countries (${VISIBLE_BOT_COUNT} visible, ${HIDDEN_BOT_COUNT} hidden).`
  );
}

main();
