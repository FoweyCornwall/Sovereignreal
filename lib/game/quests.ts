// Mirrors the hardcoded quest catalog inside ensure_daily_quests() in
// 0032_fix_rebirth_treasury_and_daily_quests.sql. Only used client-side
// for display labels - the server truth (which 3 quests you get, their
// target/reward, and completion detection) lives in that RPC.

export interface QuestDef {
  key: string;
  label: string;
  hint: string;
}

export const QUEST_CATALOG: Record<string, QuestDef> = {
  enact_3_policies: {
    key: "enact_3_policies",
    label: "Enact 3 policies today",
    hint: "Buy from the Store, any tier",
  },
  enact_10_policies: {
    key: "enact_10_policies",
    label: "Enact 10 policies today",
    hint: "Buy from the Store, any tier",
  },
  enact_1_t4_or_t5: {
    key: "enact_1_t4_or_t5",
    label: "Enact a Tier 4 or Tier 5 policy",
    hint: "Save up for a big one",
  },
  win_1_battle: {
    key: "win_1_battle",
    label: "Win 1 Battle",
    hint: "Head to Battle and queue up",
  },
  win_3_battles: {
    key: "win_3_battles",
    label: "Win 3 Battles",
    hint: "Head to Battle and queue up",
  },
  earn_10m_gdp: {
    key: "earn_10m_gdp",
    label: "Earn 10M GDP today",
    hint: "Grow your sectors + let GDP tick up",
  },
  earn_100m_gdp: {
    key: "earn_100m_gdp",
    label: "Earn 100M GDP today",
    hint: "Grow your sectors + let GDP tick up",
  },
  earn_1b_gdp: {
    key: "earn_1b_gdp",
    label: "Earn 1B GDP today",
    hint: "High-tier policies + mutations",
  },
};

export interface DailyQuest {
  id: string;
  questKey: string;
  target: number;
  progress: number;
  rewardCredits: number;
  completedAt: string | null;
  claimedAt: string | null;
}
