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
          created_at: string;
        };
        Insert: { id: string; email: string; full_name?: string | null };
        Update: { email?: string; full_name?: string | null };
        Relationships: NoRelationships;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          razorpay_customer_id: string | null;
          razorpay_subscription_id: string | null;
          status: "inactive" | "active" | "past_due" | "canceled";
          current_period_end: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status?: "inactive" | "active" | "past_due" | "canceled";
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_end?: string | null;
        };
        Update: {
          status?: "inactive" | "active" | "past_due" | "canceled";
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          current_period_end?: string | null;
        };
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
