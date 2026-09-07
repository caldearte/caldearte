export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_usage_log: {
        Row: {
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          created_at: string
          estimated_cost_usd: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          pipeline: string | null
          purpose: string
          region_id: string | null
          web_search_requests: number
        }
        Insert: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          estimated_cost_usd: number
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          pipeline?: string | null
          purpose: string
          region_id?: string | null
          web_search_requests?: number
        }
        Update: {
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          pipeline?: string | null
          purpose?: string
          region_id?: string | null
          web_search_requests?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      bright_source_fetch_state: {
        Row: {
          consecutive_zero_yield_at_cap: number
          interval_days: number | null
          is_inactive: boolean
          last_fetched_at: string
          url: string
        }
        Insert: {
          consecutive_zero_yield_at_cap?: number
          interval_days?: number | null
          is_inactive?: boolean
          last_fetched_at: string
          url: string
        }
        Update: {
          consecutive_zero_yield_at_cap?: number
          interval_days?: number | null
          is_inactive?: boolean
          last_fetched_at?: string
          url?: string
        }
        Relationships: []
      }
      curation_escalations: {
        Row: {
          accept_token: string
          created_at: string
          existing_event_id: string | null
          existing_kind: string
          existing_reasoning: string
          existing_rejected_id: string | null
          existing_source_url: string
          existing_title: string
          id: string
          new_candidate_payload: Json
          new_reasoning: string
          new_source_url: string
          new_status: string
          new_title: string
          reject_token: string
          resolution: string | null
          resolved_at: string | null
        }
        Insert: {
          accept_token: string
          created_at?: string
          existing_event_id?: string | null
          existing_kind: string
          existing_reasoning: string
          existing_rejected_id?: string | null
          existing_source_url: string
          existing_title: string
          id?: string
          new_candidate_payload: Json
          new_reasoning: string
          new_source_url: string
          new_status: string
          new_title: string
          reject_token: string
          resolution?: string | null
          resolved_at?: string | null
        }
        Update: {
          accept_token?: string
          created_at?: string
          existing_event_id?: string | null
          existing_kind?: string
          existing_reasoning?: string
          existing_rejected_id?: string | null
          existing_source_url?: string
          existing_title?: string
          id?: string
          new_candidate_payload?: Json
          new_reasoning?: string
          new_source_url?: string
          new_status?: string
          new_title?: string
          reject_token?: string
          resolution?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curation_escalations_existing_event_id_fkey"
            columns: ["existing_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curation_escalations_existing_event_id_fkey"
            columns: ["existing_event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curation_escalations_existing_rejected_id_fkey"
            columns: ["existing_rejected_id"]
            isOneToOne: false
            referencedRelation: "rejected_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      detected_sources: {
        Row: {
          created_at: string
          id: string
          last_reviewed_at: string | null
          note: string
          source_type: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_reviewed_at?: string | null
          note: string
          source_type?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          last_reviewed_at?: string | null
          note?: string
          source_type?: string
          url?: string
        }
        Relationships: []
      }
      discovery_run_summaries: {
        Row: {
          approved_by_curation: number
          candidates_total: number
          cost_usd: number
          created_at: string
          duplicate_skipped_count: number
          entrypoint: string
          escalated_count: number
          expired_count: number
          id: string
          insert_failed_count: number
          inserted_count: number
          raw_summary: Json
          rejected_by_curation: number
          replaced_count: number
          started_at: string
        }
        Insert: {
          approved_by_curation?: number
          candidates_total?: number
          cost_usd?: number
          created_at?: string
          duplicate_skipped_count?: number
          entrypoint: string
          escalated_count?: number
          expired_count?: number
          id?: string
          insert_failed_count?: number
          inserted_count?: number
          raw_summary: Json
          rejected_by_curation?: number
          replaced_count?: number
          started_at: string
        }
        Update: {
          approved_by_curation?: number
          candidates_total?: number
          cost_usd?: number
          created_at?: string
          duplicate_skipped_count?: number
          entrypoint?: string
          escalated_count?: number
          expired_count?: number
          id?: string
          insert_failed_count?: number
          inserted_count?: number
          raw_summary?: Json
          rejected_by_curation?: number
          replaced_count?: number
          started_at?: string
        }
        Relationships: []
      }
      event_images: {
        Row: {
          created_at: string
          event_id: string
          id: string
          position: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          position: number
          storage_path: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_images_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_images_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          admin_sensitive_marked_at: string | null
          artist: string | null
          artist_instagram_handle: string | null
          created_at: string
          curation_reasoning: string | null
          curation_status: string
          description: string | null
          event_type: string
          freeform_location: string
          id: string
          image_storage_path: string | null
          image_url: string | null
          medium_type: string | null
          opening_date_confidence: string
          opening_datetime: string | null
          opening_time_confirmed: boolean
          pipeline: string | null
          place_name: string | null
          public_explanation: string | null
          region_id: string | null
          removed_at: string | null
          removed_reason: string | null
          run_end_date: string | null
          run_start_date: string | null
          sensitivity_tags: string[]
          source: string
          source_account: string | null
          source_url: string | null
          submitter_email: string | null
          submitter_name: string | null
          title: string
        }
        Insert: {
          address?: string | null
          admin_sensitive_marked_at?: string | null
          artist?: string | null
          artist_instagram_handle?: string | null
          created_at?: string
          curation_reasoning?: string | null
          curation_status?: string
          description?: string | null
          event_type?: string
          freeform_location: string
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          medium_type?: string | null
          opening_date_confidence?: string
          opening_datetime?: string | null
          opening_time_confirmed?: boolean
          pipeline?: string | null
          place_name?: string | null
          public_explanation?: string | null
          region_id?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          run_end_date?: string | null
          run_start_date?: string | null
          sensitivity_tags?: string[]
          source: string
          source_account?: string | null
          source_url?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          title: string
        }
        Update: {
          address?: string | null
          admin_sensitive_marked_at?: string | null
          artist?: string | null
          artist_instagram_handle?: string | null
          created_at?: string
          curation_reasoning?: string | null
          curation_status?: string
          description?: string | null
          event_type?: string
          freeform_location?: string
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          medium_type?: string | null
          opening_date_confidence?: string
          opening_datetime?: string | null
          opening_time_confirmed?: boolean
          pipeline?: string | null
          place_name?: string | null
          public_explanation?: string | null
          region_id?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          run_end_date?: string | null
          run_start_date?: string | null
          sensitivity_tags?: string[]
          source?: string
          source_account?: string | null
          source_url?: string | null
          submitter_email?: string | null
          submitter_name?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_account_snapshots: {
        Row: {
          created_at: string
          followers_count: number
          id: string
          media_count: number
          snapshot_date: string
        }
        Insert: {
          created_at?: string
          followers_count: number
          id?: string
          media_count: number
          snapshot_date: string
        }
        Update: {
          created_at?: string
          followers_count?: number
          id?: string
          media_count?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          comments_count: number | null
          created_at: string
          id: string
          like_count: number | null
          media_id: string
          metrics_updated_at: string | null
          post_type: string
          published_at: string
          reach: number | null
          saved: number | null
          week_start: string
        }
        Insert: {
          comments_count?: number | null
          created_at?: string
          id?: string
          like_count?: number | null
          media_id: string
          metrics_updated_at?: string | null
          post_type: string
          published_at: string
          reach?: number | null
          saved?: number | null
          week_start: string
        }
        Update: {
          comments_count?: number | null
          created_at?: string
          id?: string
          like_count?: number | null
          media_id?: string
          metrics_updated_at?: string | null
          post_type?: string
          published_at?: string
          reach?: number | null
          saved?: number | null
          week_start?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          admin_region_name: string
          confirm_token: string
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          unsubscribed_at: string | null
        }
        Insert: {
          admin_region_name: string
          confirm_token: string
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          unsubscribed_at?: string | null
        }
        Update: {
          admin_region_name?: string
          confirm_token?: string
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      out_of_scope_signals: {
        Row: {
          anchor_date: string | null
          category: string
          created_at: string
          id: string
          pipeline: string
          reason: string
          region_id: string | null
          source_account: string | null
          source_url: string | null
          title: string
        }
        Insert: {
          anchor_date?: string | null
          category: string
          created_at?: string
          id?: string
          pipeline: string
          reason: string
          region_id?: string | null
          source_account?: string | null
          source_url?: string | null
          title: string
        }
        Update: {
          anchor_date?: string | null
          category?: string
          created_at?: string
          id?: string
          pipeline?: string
          reason?: string
          region_id?: string | null
          source_account?: string | null
          source_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "out_of_scope_signals_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "out_of_scope_signals_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_cost_snapshots: {
        Row: {
          amount_usd: number
          id: string
          platform: string
          raw: Json | null
          recorded_at: string
          usage_date: string
        }
        Insert: {
          amount_usd: number
          id?: string
          platform: string
          raw?: Json | null
          recorded_at?: string
          usage_date: string
        }
        Update: {
          amount_usd?: number
          id?: string
          platform?: string
          raw?: Json | null
          recorded_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          bucket_key: string
          count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      raw_search_results: {
        Row: {
          created_at: string
          domain: string
          id: string
          score: number
          title: string
          unit_name: string
          url: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          score: number
          title: string
          unit_name: string
          url: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          score?: number
          title?: string
          unit_name?: string
          url?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          admin_region_name: string | null
          admin_region_numeral: string | null
          admin_region_order: number | null
          consecutive_zero_yield_runs: number
          country: string
          created_at: string
          exclusion_reason: string | null
          expansion_rank: number | null
          id: string
          language: string
          last_run_at: string | null
          lat: number | null
          lng: number | null
          name: string
          population: number | null
          search_frequency: string | null
          status: string
        }
        Insert: {
          admin_region_name?: string | null
          admin_region_numeral?: string | null
          admin_region_order?: number | null
          consecutive_zero_yield_runs?: number
          country: string
          created_at?: string
          exclusion_reason?: string | null
          expansion_rank?: number | null
          id?: string
          language: string
          last_run_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          population?: number | null
          search_frequency?: string | null
          status?: string
        }
        Update: {
          admin_region_name?: string | null
          admin_region_numeral?: string | null
          admin_region_order?: number | null
          consecutive_zero_yield_runs?: number
          country?: string
          created_at?: string
          exclusion_reason?: string | null
          expansion_rank?: number | null
          id?: string
          language?: string
          last_run_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          population?: number | null
          search_frequency?: string | null
          status?: string
        }
        Relationships: []
      }
      rejected_candidates: {
        Row: {
          anchor_date: string | null
          created_at: string
          id: string
          location: string | null
          pipeline: string | null
          reason: string
          region_id: string | null
          rejection_axis: string | null
          source_account: string | null
          source_url: string
          title: string
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          location?: string | null
          pipeline?: string | null
          reason: string
          region_id?: string | null
          rejection_axis?: string | null
          source_account?: string | null
          source_url: string
          title: string
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          id?: string
          location?: string | null
          pipeline?: string | null
          reason?: string
          region_id?: string | null
          rejection_axis?: string | null
          source_account?: string | null
          source_url?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejected_candidates_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejected_candidates_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      shadow_curation_comparisons: {
        Row: {
          agree: boolean
          created_at: string
          error: string | null
          id: string
          label: string
          model: string
          pipeline: string
          real_status: string
          real_tags: string[]
          shadow_status: string
          shadow_tags: string[]
        }
        Insert: {
          agree: boolean
          created_at?: string
          error?: string | null
          id?: string
          label: string
          model: string
          pipeline: string
          real_status: string
          real_tags?: string[]
          shadow_status: string
          shadow_tags?: string[]
        }
        Update: {
          agree?: boolean
          created_at?: string
          error?: string | null
          id?: string
          label?: string
          model?: string
          pipeline?: string
          real_status?: string
          real_tags?: string[]
          shadow_status?: string
          shadow_tags?: string[]
        }
        Relationships: []
      }
      social_post_log: {
        Row: {
          event_id: string
          id: string
          post_type: string
          posted_at: string
          week_start: string
        }
        Insert: {
          event_id: string
          id?: string
          post_type: string
          posted_at?: string
          week_start: string
        }
        Update: {
          event_id?: string
          id?: string
          post_type?: string
          posted_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      events_public: {
        Row: {
          address: string | null
          artist: string | null
          description: string | null
          event_type: string | null
          freeform_location: string | null
          id: string | null
          image_url: string | null
          opening_datetime: string | null
          opening_time_confirmed: boolean | null
          place_name: string | null
          region_id: string | null
          run_end_date: string | null
          run_start_date: string | null
          sensitivity_tags: string[] | null
          source_url: string | null
          title: string | null
        }
        Insert: {
          address?: string | null
          artist?: string | null
          description?: string | null
          event_type?: string | null
          freeform_location?: string | null
          id?: string | null
          image_url?: string | null
          opening_datetime?: string | null
          opening_time_confirmed?: boolean | null
          place_name?: string | null
          region_id?: string | null
          run_end_date?: string | null
          run_start_date?: string | null
          sensitivity_tags?: never
          source_url?: string | null
          title?: string | null
        }
        Update: {
          address?: string | null
          artist?: string | null
          description?: string | null
          event_type?: string | null
          freeform_location?: string | null
          id?: string | null
          image_url?: string | null
          opening_datetime?: string | null
          opening_time_confirmed?: boolean | null
          place_name?: string | null
          region_id?: string | null
          run_end_date?: string | null
          run_start_date?: string | null
          sensitivity_tags?: never
          source_url?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      regions_public: {
        Row: {
          admin_region_name: string | null
          admin_region_numeral: string | null
          admin_region_order: number | null
          country: string | null
          id: string | null
          lat: number | null
          lng: number | null
          name: string | null
          population: number | null
        }
        Insert: {
          admin_region_name?: string | null
          admin_region_numeral?: string | null
          admin_region_order?: number | null
          country?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          population?: number | null
        }
        Update: {
          admin_region_name?: string | null
          admin_region_numeral?: string | null
          admin_region_order?: number | null
          country?: string | null
          id?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          population?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_count: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      prune_expired_events: {
        Args: { cutoff_date: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

