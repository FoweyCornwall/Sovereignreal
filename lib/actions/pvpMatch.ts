"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Sector } from "@/lib/game/constants";

export interface MatchSectorState {
  sector: Sector;
  currentScore: number;
  mutationMultiplier: number | null;
}

export interface MatchEvent {
  id: number;
  turnNumber: number;
  attackerCountryId: string | null;
  targetSector: Sector | null;
  outcome: "hit" | "miss" | "auto_pass";
  damage: number;
  treasurySkim: number;
  hitChance: number | null;
}

export interface AttackResult {
  ok: boolean;
  reason?: string;
  targetSector?: Sector;
  outcome?: "hit" | "miss";
  damage?: number;
  treasurySkim?: number;
  hitChance?: number;
}

export type WinReason = "conquest" | "turn_limit" | "draw";

export interface MatchState {
  matchId: string;
  status: "active" | "completed";
  mySide: "a" | "b";
  sideACountryId: string;
  sideBCountryId: string;
  sideBIsBot: boolean;
  currentTurnCountryId: string;
  turnNumber: number;
  turnsPerSide: number;
  turnDeadline: string;
  sideAConquests: number;
  sideBConquests: number;
  sideASkimmed: number;
  sideBSkimmed: number;
  winnerCountryId: string | null;
  payoutAmount: number | null;
  winReason: WinReason | null;
  mySectors: MatchSectorState[];
  opponentSectors: MatchSectorState[];
  events: MatchEvent[];
}

export interface MatchStateResponse extends MatchState {
  ok: boolean;
  reason?: string;
  attackResult?: AttackResult;
}

export type FindMatchResult =
  | { ok: true; matched: false }
  | { ok: true; matched: true; matchId: string }
  | { ok: false; reason: string };

async function requireCountryId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    redirect("/login");
  }

  const { data: country } = await supabase
    .from("countries")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!country) {
    redirect("/setup");
  }

  return country.id;
}

export async function findMatch(): Promise<FindMatchResult> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("find_match", { p_country_id: countryId });
  if (error) {
    throw new Error(`Failed to find match: ${error.message}`);
  }

  const result = data as unknown as {
    ok: boolean;
    matched?: boolean;
    match_id?: string;
    reason?: string;
  };

  if (!result.ok) {
    return { ok: false, reason: result.reason ?? "UNKNOWN" };
  }
  if (!result.matched) {
    return { ok: true, matched: false };
  }
  return { ok: true, matched: true, matchId: result.match_id! };
}

export async function cancelMatchSearch(): Promise<void> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  await supabase.rpc("cancel_match_search", { p_country_id: countryId });
}

export async function pollMatch(matchId: string): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("poll_match", {
    p_match_id: matchId,
    p_country_id: countryId,
  });

  if (error) {
    throw new Error(`Failed to poll match: ${error.message}`);
  }

  return data as unknown as MatchStateResponse;
}

export async function submitAttack(
  matchId: string,
  targetSector: Sector
): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("submit_attack", {
    p_match_id: matchId,
    p_country_id: countryId,
    p_target_sector: targetSector,
  });

  if (error) {
    throw new Error(`Failed to submit attack: ${error.message}`);
  }

  return data as unknown as MatchStateResponse;
}

export interface RecentMatch {
  id: string;
  sideACountryId: string;
  sideAName: string;
  sideBCountryId: string;
  sideBName: string;
  sideBIsBot: boolean;
  winnerCountryId: string | null;
  payoutAmount: number | null;
  winReason: WinReason | null;
  sideAConquests: number;
  sideBConquests: number;
  completedAt: string | null;
}

export async function getRecentMatches(): Promise<RecentMatch[]> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("get_recent_matches", {
    p_country_id: countryId,
    p_limit: 20,
  });

  if (error) {
    throw new Error(`Failed to load match history: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sideACountryId: row.side_a_country_id,
    sideAName: row.side_a_name,
    sideBCountryId: row.side_b_country_id,
    sideBName: row.side_b_name,
    sideBIsBot: row.side_b_is_bot,
    winnerCountryId: row.winner_country_id,
    payoutAmount: row.payout_amount,
    winReason: row.win_reason as WinReason | null,
    sideAConquests: row.side_a_conquests,
    sideBConquests: row.side_b_conquests,
    completedAt: row.completed_at,
  }));
}
