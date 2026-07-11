// Hand-written to match supabase/migrations/0001_init.sql through
// 0007_bots_and_leaderboard.sql. Once the project is linked, regenerate with
// `supabase gen types typescript --linked > lib/types/database.ts` and
// reconcile any drift.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          credits: number;
          last_daily_claim_at: string | null;
          equipped_sector_theme: string | null;
          vip_expires_at: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          last_free_restock_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          credits?: number;
          last_daily_claim_at?: string | null;
          equipped_sector_theme?: string | null;
          vip_expires_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          last_free_restock_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          credits?: number;
          last_daily_claim_at?: string | null;
          equipped_sector_theme?: string | null;
          vip_expires_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          last_free_restock_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      countries: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          username: string | null;
          flag_emoji: string | null;
          flag_style: Json | null;
          country_code: string | null;
          gdp: number;
          gdp_per_sec: number;
          treasury: number;
          treasury_regen_per_sec: number;
          is_bot: boolean;
          is_vip_bot: boolean;
          last_settled_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          username?: string | null;
          flag_emoji?: string | null;
          flag_style?: Json | null;
          country_code?: string | null;
          gdp?: number;
          gdp_per_sec?: number;
          treasury?: number;
          treasury_regen_per_sec?: number;
          is_bot?: boolean;
          is_vip_bot?: boolean;
          last_settled_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["countries"]["Insert"]>;
        Relationships: [];
      };
      sector_state: {
        Row: {
          country_id: string;
          sector: string;
          score: number;
          previous_score: number;
          updated_at: string;
        };
        Insert: {
          country_id: string;
          sector: string;
          score?: number;
          previous_score?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sector_state"]["Insert"]>;
        Relationships: [];
      };
      policy_library: {
        Row: {
          id: string;
          key: string;
          title: string;
          description: string | null;
          tier: number;
          primary_sector: string;
          stat_deltas: Json;
          base_cost: number;
          duration_seconds: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["policy_library"]["Row"]> & {
          key: string;
          title: string;
          tier: number;
          primary_sector: string;
          stat_deltas: Json;
          base_cost: number;
          duration_seconds: number;
        };
        Update: Partial<Database["public"]["Tables"]["policy_library"]["Row"]>;
        Relationships: [];
      };
      active_policies: {
        Row: {
          id: string;
          country_id: string;
          policy_id: string;
          tier: number;
          cost_paid: number;
          stat_deltas: Json;
          started_at: string;
          completes_at: string;
          settled: boolean;
          settled_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["active_policies"]["Row"]> & {
          country_id: string;
          policy_id: string;
          tier: number;
          cost_paid: number;
          stat_deltas: Json;
          completes_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["active_policies"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "active_policies_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "policy_library";
            referencedColumns: ["id"];
          },
        ];
      };
      gdp_history: {
        Row: {
          id: number;
          country_id: string;
          gdp: number;
          recorded_at: string;
        };
        Insert: {
          id?: number;
          country_id: string;
          gdp: number;
          recorded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["gdp_history"]["Insert"]>;
        Relationships: [];
      };
      store_state: {
        Row: { id: number; restock_at: string };
        Insert: { id?: number; restock_at?: string };
        Update: { id?: number; restock_at?: string };
        Relationships: [];
      };
      store_slots: {
        Row: {
          slot_position: number;
          policy_id: string;
          quantity: number;
          initial_quantity: number;
          rolled_at: string;
          last_decay_at: string;
        };
        Insert: {
          slot_position: number;
          policy_id: string;
          quantity?: number;
          initial_quantity?: number;
          rolled_at?: string;
          last_decay_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["store_slots"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "store_slots_policy_id_fkey";
            columns: ["policy_id"];
            isOneToOne: false;
            referencedRelation: "policy_library";
            referencedColumns: ["id"];
          },
        ];
      };
      sector_mutations: {
        Row: {
          country_id: string;
          sector: string;
          rarity: string;
          multiplier: number;
          acquired_at: string;
        };
        Insert: {
          country_id: string;
          sector: string;
          rarity: string;
          multiplier: number;
          acquired_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sector_mutations"]["Insert"]>;
        Relationships: [];
      };
      mutation_item_library: {
        Row: {
          id: string;
          key: string;
          title: string;
          description: string | null;
          target_sectors: string[];
          proc_multiplier: number;
          duration_seconds: number;
          base_cost: number;
          is_active: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["mutation_item_library"]["Row"]> & {
          key: string;
          title: string;
          target_sectors: string[];
          proc_multiplier: number;
          duration_seconds: number;
          base_cost: number;
        };
        Update: Partial<Database["public"]["Tables"]["mutation_item_library"]["Row"]>;
        Relationships: [];
      };
      mutation_boosts: {
        Row: {
          id: string;
          country_id: string;
          target_sectors: string[];
          proc_multiplier: number;
          expires_at: string;
        };
        Insert: {
          id?: string;
          country_id: string;
          target_sectors: string[];
          proc_multiplier: number;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["mutation_boosts"]["Insert"]>;
        Relationships: [];
      };
      credit_purchases: {
        Row: {
          id: string;
          country_id: string;
          stripe_session_id: string;
          pack_key: string;
          credits_granted: number;
          amount_cents: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          country_id: string;
          stripe_session_id: string;
          pack_key: string;
          credits_granted: number;
          amount_cents: number;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_purchases"]["Insert"]>;
        Relationships: [];
      };
      bot_drift_state: {
        Row: { id: number; last_drift_at: string };
        Insert: { id?: number; last_drift_at?: string };
        Update: { id?: number; last_drift_at?: string };
        Relationships: [];
      };
      cosmetic_packs: {
        Row: {
          key: string;
          name: string;
          description: string | null;
          price_credits: number;
          theme: string;
        };
        Insert: {
          key: string;
          name: string;
          description?: string | null;
          price_credits: number;
          theme: string;
        };
        Update: Partial<Database["public"]["Tables"]["cosmetic_packs"]["Insert"]>;
        Relationships: [];
      };
      user_cosmetics: {
        Row: { user_id: string; pack_key: string; acquired_at: string };
        Insert: { user_id: string; pack_key: string; acquired_at?: string };
        Update: Partial<Database["public"]["Tables"]["user_cosmetics"]["Insert"]>;
        Relationships: [];
      };
      battle_queue: {
        Row: { country_id: string; rank_tier: string; is_vip: boolean; queued_at: string };
        Insert: { country_id: string; rank_tier: string; is_vip?: boolean; queued_at?: string };
        Update: Partial<Database["public"]["Tables"]["battle_queue"]["Insert"]>;
        Relationships: [];
      };
      battles: {
        Row: {
          id: string;
          attacker_id: string;
          defender_id: string;
          defender_is_bot: boolean;
          winner_id: string | null;
          attacker_power: number;
          defender_power: number;
          loot_amount: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["battles"]["Row"]> & {
          attacker_id: string;
          defender_id: string;
          attacker_power: number;
          defender_power: number;
        };
        Update: Partial<Database["public"]["Tables"]["battles"]["Row"]>;
        Relationships: [];
      };
      battle_cooldowns: {
        Row: { attacker_id: string; defender_id: string; last_attacked_at: string };
        Insert: { attacker_id: string; defender_id: string; last_attacked_at?: string };
        Update: Partial<Database["public"]["Tables"]["battle_cooldowns"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      policy_history: {
        Row: {
          id: string;
          country_id: string;
          title: string;
          primary_sector: string;
          stat_deltas: Json;
          cost_paid: number;
          started_at: string;
          settled_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      settle_country: {
        Args: { p_country_id: string };
        Returns: Database["public"]["Tables"]["countries"]["Row"];
      };
      enact_store_policy: {
        Args: { p_country_id: string; p_position: number; p_expected_policy_id: string };
        Returns: Json;
      };
      refresh_store: {
        Args: { p_country_id: string };
        Returns: Json;
      };
      get_store: {
        Args: Record<string, never>;
        Returns: {
          slot_position: number;
          policy_id: string;
          title: string;
          description: string | null;
          tier: number;
          primary_sector: string;
          stat_deltas: Json;
          base_cost: number;
          duration_seconds: number;
          quantity: number;
          initial_quantity: number;
          restock_at: string;
        }[];
      };
      enact_mutation_item: {
        Args: { p_country_id: string; p_item_id: string };
        Returns: Json;
      };
      is_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      claim_daily_reward: {
        Args: Record<string, never>;
        Returns: Json;
      };
      get_leaderboard: {
        Args: { p_limit?: number };
        Returns: {
          country_id: string;
          name: string;
          username: string | null;
          flag_emoji: string | null;
          flag_style: Json | null;
          country_code: string | null;
          gdp: number;
          rank: number;
          is_vip: boolean;
        }[];
      };
      get_my_rank: {
        Args: { p_country_id: string };
        Returns: number;
      };
      purchase_cosmetic_pack: {
        Args: { p_pack_key: string };
        Returns: Json;
      };
      equip_sector_theme: {
        Args: { p_theme: string | null };
        Returns: Json;
      };
      is_vip: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      claim_vip_free_restock: {
        Args: { p_country_id: string };
        Returns: Json;
      };
      find_battle: {
        Args: { p_country_id: string };
        Returns: Json;
      };
      cancel_battle_search: {
        Args: { p_country_id: string };
        Returns: undefined;
      };
      get_recent_battles: {
        Args: { p_country_id: string; p_limit?: number };
        Returns: {
          id: string;
          attacker_id: string;
          attacker_name: string;
          defender_id: string;
          defender_name: string;
          defender_is_bot: boolean;
          winner_id: string | null;
          loot_amount: number;
          created_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
