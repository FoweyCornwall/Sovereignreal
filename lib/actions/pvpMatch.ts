"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type TileType = "home_a" | "home_b" | "hub" | "oil" | "tech" | "agriculture" | "neutral";

export interface MatchTile {
  q: number;
  r: number;
  tileType: TileType;
  ownerCountryId: string | null;
  connected: boolean;
}

export interface ClaimResult {
  ok: boolean;
  reason?: string;
  q?: number;
  r?: number;
  cost?: number;
}

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
  sideAApRemaining: number;
  sideBApRemaining: number;
  sideACash: number;
  sideBCash: number;
  oilSaturatedUntilTurn: number | null;
  techSaturatedUntilTurn: number | null;
  agricultureSaturatedUntilTurn: number | null;
  winnerCountryId: string | null;
  payoutAmount: number | null;
  tiles: MatchTile[];
}

export interface MatchStateResponse extends MatchState {
  ok: boolean;
  reason?: string;
  claimResult?: ClaimResult;
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

export async function submitClaim(
  matchId: string,
  q: number,
  r: number
): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("submit_claim", {
    p_match_id: matchId,
    p_country_id: countryId,
    p_q: q,
    p_r: r,
  });

  if (error) {
    throw new Error(`Failed to submit claim: ${error.message}`);
  }

  return data as unknown as MatchStateResponse;
}

export async function endTurn(matchId: string): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("end_turn", {
    p_match_id: matchId,
    p_country_id: countryId,
  });

  if (error) {
    throw new Error(`Failed to end turn: ${error.message}`);
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
  sideACash: number;
  sideBCash: number;
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
    sideACash: row.side_a_cash,
    sideBCash: row.side_b_cash,
    completedAt: row.completed_at,
  }));
}
