/**
 * Database types for the Markoby schema (supabase/migrations/0001_init.sql).
 *
 * Hand-written to match the migration so the app typechecks without a linked
 * Supabase project. Relationships are declared only where the app uses
 * embedded selects (projects → project_platforms). After applying migrations,
 * regenerate the full file with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type NoRelationships = [];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          referral_code: string | null;
          referred_by: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          referral_code?: string | null;
          referred_by?: string | null;
        };
        Relationships: NoRelationships;
      };
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referred_id: string;
          status: "pending" | "rewarded" | "reversed";
          created_at: string;
        };
        Insert: {
          referrer_id: string;
          referred_id: string;
          status?: "pending" | "rewarded" | "reversed";
        };
        Update: { status?: "pending" | "rewarded" | "reversed" };
        Relationships: NoRelationships;
      };
      referral_rewards: {
        Row: {
          id: string;
          referral_id: string;
          provider: "razorpay" | "paypal";
          payment_id: string;
          currency: "INR" | "USD";
          amount: number;
          status: "pending" | "released" | "reversed";
          payment_verified_at: string;
          eligible_at: string;
          released_at: string | null;
          reversed_at: string | null;
        };
        Insert: {
          referral_id: string;
          provider: "razorpay" | "paypal";
          payment_id: string;
          currency: "INR" | "USD";
          amount: number;
          status?: "pending" | "released" | "reversed";
          eligible_at: string;
        };
        Update: {
          status?: "pending" | "released" | "reversed";
          released_at?: string | null;
          reversed_at?: string | null;
        };
        Relationships: NoRelationships;
      };
      wallet_ledger: {
        Row: {
          id: string;
          user_id: string;
          currency: "INR" | "USD";
          amount: number;
          entry_type:
            | "referral_pending"
            | "referral_released"
            | "referral_reversed"
            | "withdrawal_reserved"
            | "withdrawal_paid"
            | "withdrawal_released";
          referral_reward_id: string | null;
          withdrawal_request_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          currency: "INR" | "USD";
          amount: number;
          entry_type:
            | "referral_pending"
            | "referral_released"
            | "referral_reversed"
            | "withdrawal_reserved"
            | "withdrawal_paid"
            | "withdrawal_released";
          referral_reward_id?: string | null;
          withdrawal_request_id?: string | null;
          note?: string | null;
        };
        Update: Record<string, never>;
        Relationships: NoRelationships;
      };
      withdrawal_requests: {
        Row: {
          id: string;
          user_id: string;
          currency: "INR" | "USD";
          amount: number;
          status:
            | "requested"
            | "under_review"
            | "approved"
            | "paid"
            | "rejected"
            | "cancelled";
          payout_method: string;
          payout_details: Json;
          admin_note: string | null;
          payment_reference: string | null;
          paid_at: string | null;
          paid_by_admin: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          currency: "INR" | "USD";
          amount: number;
          status?:
            | "requested"
            | "under_review"
            | "approved"
            | "paid"
            | "rejected"
            | "cancelled";
          payout_method?: string;
          payout_details?: Json;
        };
        Update: {
          status?:
            | "requested"
            | "under_review"
            | "approved"
            | "paid"
            | "rejected"
            | "cancelled";
          payout_method?: string;
          payout_details?: Json;
          admin_note?: string | null;
          payment_reference?: string | null;
          paid_at?: string | null;
          paid_by_admin?: string | null;
        };
        Relationships: NoRelationships;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          razorpay_customer_id: string | null;
          razorpay_subscription_id: string | null;
          payment_provider: "razorpay" | "paypal";
          paypal_subscription_id: string | null;
          status: "inactive" | "active" | "past_due" | "canceled";
          currency: "INR" | "USD";
          current_period_end: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status?: "inactive" | "active" | "past_due" | "canceled";
          currency?: "INR" | "USD";
          payment_provider?: "razorpay" | "paypal";
          paypal_subscription_id?: string | null;
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_end?: string | null;
        };
        Update: {
          status?: "inactive" | "active" | "past_due" | "canceled";
          currency?: "INR" | "USD";
          payment_provider?: "razorpay" | "paypal";
          paypal_subscription_id?: string | null;
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_end?: string | null;
        };
        Relationships: NoRelationships;
      };
      webhook_events: {
        Row: {
          id: string;
          provider: "razorpay" | "paypal";
          event_id: string;
          event_type: string;
          received_at: string;
        };
        Insert: {
          provider: "razorpay" | "paypal";
          event_id: string;
          event_type: string;
        };
        Update: { event_type?: string };
        Relationships: NoRelationships;
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          website_url: string | null;
          website_context: string | null;
          status: "onboarding" | "plan_ready" | "active";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          website_url?: string | null;
          website_context?: string | null;
          status?: "onboarding" | "plan_ready" | "active";
        };
        Update: {
          user_id?: string;
          name?: string;
          website_url?: string | null;
          website_context?: string | null;
          status?: "onboarding" | "plan_ready" | "active";
        };
        Relationships: NoRelationships;
      };
      onboarding_messages: {
        Row: {
          id: string;
          project_id: string;
          role: "assistant" | "user";
          content: string;
          created_at: string;
        };
        Insert: { project_id: string; role: "assistant" | "user"; content: string };
        Update: { content?: string };
        Relationships: NoRelationships;
      };
      onboarding_summary: {
        Row: {
          id: string;
          project_id: string;
          business_description: string;
          target_audience: string;
          value_prop: string;
          tone_of_voice: string;
          constraints: string | null;
          competitor_notes: string | null;
          raw_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          business_description: string;
          target_audience: string;
          value_prop: string;
          tone_of_voice: string;
          constraints?: string | null;
          competitor_notes?: string | null;
          raw_json?: Json | null;
        };
        Update: {
          business_description?: string;
          target_audience?: string;
          value_prop?: string;
          tone_of_voice?: string;
          constraints?: string | null;
          competitor_notes?: string | null;
          raw_json?: Json | null;
        };
        Relationships: NoRelationships;
      };
      project_platforms: {
        Row: {
          id: string;
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          enabled_at: string;
        };
        Insert: {
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
        };
        Update: { platform?: "reddit" | "x" | "instagram" | "discord" | "youtube" };
        Relationships: NoRelationships;
      };
      marketing_plans: {
        Row: {
          id: string;
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          status: "pending" | "generating" | "ready" | "failed";
          plan_json: Json | null;
          model_used: string | null;
          prompt_version: string | null;
          error: string | null;
          generated_at: string | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          status?: "pending" | "generating" | "ready" | "failed";
          plan_json?: Json | null;
          model_used?: string | null;
          prompt_version?: string | null;
          error?: string | null;
          generated_at?: string | null;
        };
        Update: {
          status?: "pending" | "generating" | "ready" | "failed";
          plan_json?: Json | null;
          model_used?: string | null;
          prompt_version?: string | null;
          error?: string | null;
          generated_at?: string | null;
        };
        Relationships: NoRelationships;
      };
      prospects: {
        Row: {
          id: string;
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          external_handle_or_url: string;
          display_name: string | null;
          relevance_reason: string | null;
          relevance_score: number | null;
          context_excerpt: string | null;
          source_type: "api" | "guide";
          status: "new" | "contacted" | "ignored";
          discovered_at: string;
        };
        Insert: {
          project_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          external_handle_or_url: string;
          display_name?: string | null;
          relevance_reason?: string | null;
          relevance_score?: number | null;
          context_excerpt?: string | null;
          source_type?: "api" | "guide";
          status?: "new" | "contacted" | "ignored";
        };
        Update: {
          status?: "new" | "contacted" | "ignored";
          relevance_reason?: string | null;
        };
        Relationships: NoRelationships;
      };
      usage_events: {
        Row: {
          id: string;
          user_id: string | null;
          event_type: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: { user_id?: string | null; event_type: string; metadata?: Json | null };
        Update: { event_type?: string; metadata?: Json | null };
        Relationships: NoRelationships;
      };
      // ── migration 0002 ──────────────────────────────────────────────────
      plan_items: {
        Row: {
          id: string;
          project_id: string;
          plan_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          source_key: string;
          week: number;
          day: string | null;
          type: string | null;
          title_or_hook: string;
          details: string | null;
          effort_minutes: number | null;
          scheduled_date: string | null;
          posted_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          plan_id: string;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          source_key: string;
          week?: number;
          day?: string | null;
          type?: string | null;
          title_or_hook: string;
          details?: string | null;
          effort_minutes?: number | null;
          scheduled_date?: string | null;
          posted_at?: string | null;
          sort_order?: number;
        };
        Update: {
          scheduled_date?: string | null;
          posted_at?: string | null;
          title_or_hook?: string;
          details?: string | null;
          sort_order?: number;
        };
        Relationships: NoRelationships;
      };
      post_drafts: {
        Row: {
          id: string;
          project_id: string;
          plan_item_id: string | null;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          draft_content: string;
          status: "draft" | "approved" | "posted";
          model_used: string | null;
          prompt_version: string | null;
          generated_at: string;
          edited_at: string | null;
          posted_at: string | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          plan_item_id?: string | null;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          draft_content: string;
          status?: "draft" | "approved" | "posted";
          model_used?: string | null;
          prompt_version?: string | null;
          edited_at?: string | null;
          posted_at?: string | null;
        };
        Update: {
          draft_content?: string;
          status?: "draft" | "approved" | "posted";
          edited_at?: string | null;
          posted_at?: string | null;
        };
        Relationships: NoRelationships;
      };
      post_feedback: {
        Row: {
          id: string;
          project_id: string;
          plan_item_id: string | null;
          post_draft_id: string | null;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          outcome_text: string;
          outcome_metric: Json | null;
          submitted_at: string;
        };
        Insert: {
          project_id: string;
          plan_item_id?: string | null;
          post_draft_id?: string | null;
          platform: "reddit" | "x" | "instagram" | "discord" | "youtube";
          outcome_text: string;
          outcome_metric?: Json | null;
        };
        Update: { outcome_text?: string; outcome_metric?: Json | null };
        Relationships: NoRelationships;
      };
      checkins: {
        Row: {
          id: string;
          project_id: string;
          week_start_date: string;
          prompt_text: string;
          prompt_sent_at: string;
          founder_response: string | null;
          response_received_at: string | null;
          next_week_plan_generated: boolean;
          created_at: string;
        };
        Insert: {
          project_id: string;
          week_start_date: string;
          prompt_text: string;
          founder_response?: string | null;
          response_received_at?: string | null;
          next_week_plan_generated?: boolean;
        };
        Update: {
          founder_response?: string | null;
          response_received_at?: string | null;
          next_week_plan_generated?: boolean;
        };
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_project_owner: {
        Args: Record<string, unknown>;
        Returns: boolean;
      };
      award_referral_reward: {
        Args: {
          p_referred_user_id: string;
          p_provider: string;
          p_payment_id: string;
          p_amount: number;
          p_currency: string;
          p_hours_until_eligible?: number;
        };
        Returns: string | null;
      };
      release_referral_reward: {
        Args: { p_reward_id: string };
        Returns: boolean;
      };
      reverse_referral_reward: {
        Args: { p_provider: string; p_payment_id: string };
        Returns: boolean;
      };
      wallet_balances: {
        Args: { p_user_id: string; p_currency: string };
        Returns: { available: number; pending: number }[];
      };
      reserve_withdrawal: {
        Args: { p_user_id: string; p_currency: string; p_amount: number };
        Returns: string | null;
      };
      mark_withdrawal_paid: {
        Args: { p_request_id: string; p_payment_reference: string; p_admin_email: string };
        Returns: boolean;
      };
      release_withdrawal: {
        Args: { p_request_id: string; p_admin_email: string; p_note: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
