"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Sector } from "@/lib/game/constants";

export interface CountryIdentity {
  countryId: string;
  name: string;
  username: string | null;
  flagEmoji: string | null;
  flagStyle: { bg: string; pattern?: string } | null;
  countryCode: string | null;
}

export interface MatchSectorReveal {
  sector: Sector;
  revealed: boolean;
  sideAScore: number | null;
  sideBScore: number | null;
  winnerSide: "a" | "b" | null;
}

export interface RoundResult {
  ok: boolean;
  reason?: string;
  targetSector?: Sector;
  sideAScore?: number;
  sideBScore?: number;
  winnerSide?: "a" | "b";
}

export interface MatchState {
  matchId: string;
  status: "active" | "completed";
  mySide: "a" | "b";
  sideACountryId: string;
  sideBCountryId: string;
  currentTurnCountryId: string;
  turnNumber: number;
  turnDeadline: string;
  roundsToWin: number;
  sideAWins: number;
  sideBWins: number;
  winnerCountryId: string | null;
  payoutAmount: number | null;
  forfeited: boolean;
  myIdentity: CountryIdentity;
  opponentIdentity: CountryIdentity;
  sectors: MatchSectorReveal[];
}

export interface MatchStateResponse extends MatchState {
  ok: boolean;
  reason?: string;
  roundResult?: RoundResult;
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

export async function submitAttack(matchId: string, sector: Sector): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("submit_attack", {
    p_match_id: matchId,
    p_country_id: countryId,
    p_sector: sector,
  });

  if (error) {
    throw new Error(`Failed to submit attack: ${error.message}`);
  }

  return data as unknown as MatchStateResponse;
}

export async function forfeitMatch(matchId: string): Promise<MatchStateResponse> {
  const supabase = await createClient();
  const countryId = await requireCountryId();

  const { data, error } = await supabase.rpc("forfeit_match", {
    p_match_id: matchId,
    p_country_id: countryId,
  });

  if (error) {
    throw new Error(`Failed to forfeit match: ${error.message}`);
  }

  return data as unknown as MatchStateResponse;
}

export interface RecentMatch {
  id: string;
  sideACountryId: string;
  sideAName: string;
  sideBCountryId: string;
  sideBName: string;
  winnerCountryId: string | null;
  payoutAmount: number | null;
  forfeited: boolean;
  sideAWins: number;
  sideBWins: number;
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
    winnerCountryId: row.winner_country_id,
    payoutAmount: row.payout_amount,
    forfeited: row.forfeited,
    sideAWins: row.side_a_wins,
    sideBWins: row.side_b_wins,
    completedAt: row.completed_at,
  }));
}
