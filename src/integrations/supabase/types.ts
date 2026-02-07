export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agenda_events: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string
          id: string
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_at: string
          id?: string
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string
          id?: string
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          file_size: number | null
          height: number | null
          id: string
          message_id: string
          storage_path: string
          type: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          message_id: string
          storage_path: string
          type: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          message_id?: string
          storage_path?: string
          type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_items: {
        Row: {
          created_at: string
          height: number | null
          id: string
          source_message_id: string | null
          storage_path: string
          type: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          source_message_id?: string | null
          storage_path: string
          type: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          source_message_id?: string | null
          storage_path?: string
          type?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_items_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          push_token: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          push_token?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          push_token?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reactions: Json | null
          sender_id: string
          sender_name: string
          text: string
          thread_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reactions?: Json | null
          sender_id: string
          sender_name: string
          text?: string
          thread_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reactions?: Json | null
          sender_id?: string
          sender_name?: string
          text?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          nickname: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          nickname?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          nickname?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          player_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          player_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          player_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shot_event_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string
          id: string
          payload: Json | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          payload?: Json | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_event_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "shot_events"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_events: {
        Row: {
          chosen_witness_id: string | null
          confirmed_at: string | null
          countdown_ends_at: string | null
          created_at: string
          deadline_at: string | null
          group_id: string
          id: string
          punishment_applied_at: string | null
          selected_at: string | null
          selected_user_id: string | null
          self_confirmed: boolean | null
          started_by: string
          status: string
          witness_confirmed_at: string | null
          witness_confirmed_by: string | null
        }
        Insert: {
          chosen_witness_id?: string | null
          confirmed_at?: string | null
          countdown_ends_at?: string | null
          created_at?: string
          deadline_at?: string | null
          group_id?: string
          id?: string
          punishment_applied_at?: string | null
          selected_at?: string | null
          selected_user_id?: string | null
          self_confirmed?: boolean | null
          started_by: string
          status?: string
          witness_confirmed_at?: string | null
          witness_confirmed_by?: string | null
        }
        Update: {
          chosen_witness_id?: string | null
          confirmed_at?: string | null
          countdown_ends_at?: string | null
          created_at?: string
          deadline_at?: string | null
          group_id?: string
          id?: string
          punishment_applied_at?: string | null
          selected_at?: string | null
          selected_user_id?: string | null
          self_confirmed?: boolean | null
          started_by?: string
          status?: string
          witness_confirmed_at?: string | null
          witness_confirmed_by?: string | null
        }
        Relationships: []
      }
      shot_tokens: {
        Row: {
          balance: number
          last_refill_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          last_refill_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          last_refill_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weather_ai_daily: {
        Row: {
          ai_daily: Json
          ai_summary_today: string | null
          ai_summary_tomorrow: string | null
          confidence: string
          created_at: string
          day_date: string
          id: number
          location_id: string
          rationale_short: string
          run_at: string
          source_weights: Json
        }
        Insert: {
          ai_daily: Json
          ai_summary_today?: string | null
          ai_summary_tomorrow?: string | null
          confidence: string
          created_at?: string
          day_date: string
          id?: number
          location_id: string
          rationale_short: string
          run_at?: string
          source_weights: Json
        }
        Update: {
          ai_daily?: Json
          ai_summary_today?: string | null
          ai_summary_tomorrow?: string | null
          confidence?: string
          created_at?: string
          day_date?: string
          id?: number
          location_id?: string
          rationale_short?: string
          run_at?: string
          source_weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "weather_ai_daily_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          generated_at: string
          mountain_id: string
          payload: Json
        }
        Insert: {
          generated_at?: string
          mountain_id: string
          payload: Json
        }
        Update: {
          generated_at?: string
          mountain_id?: string
          payload?: Json
        }
        Relationships: []
      }
      weather_locations: {
        Row: {
          created_at: string
          elevation_m: number | null
          id: string
          is_active: boolean
          lat: number
          lon: number
          name: string
        }
        Insert: {
          created_at?: string
          elevation_m?: number | null
          id: string
          is_active?: boolean
          lat: number
          lon: number
          name: string
        }
        Update: {
          created_at?: string
          elevation_m?: number | null
          id?: string
          is_active?: boolean
          lat?: number
          lon?: number
          name?: string
        }
        Relationships: []
      }
      weather_model_weights: {
        Row: {
          mountain_id: string
          updated_at: string
          weights: Json
        }
        Insert: {
          mountain_id: string
          updated_at?: string
          weights: Json
        }
        Update: {
          mountain_id?: string
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      weather_observed: {
        Row: {
          created_at: string
          id: string
          location_id: string
          observed_date: string
          precipitation: number | null
          source: string
          temp_max: number | null
          temp_min: number | null
          wind_gust: number | null
          wind_speed: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          observed_date: string
          precipitation?: number | null
          source?: string
          temp_max?: number | null
          temp_min?: number | null
          wind_gust?: number | null
          wind_speed?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          observed_date?: string
          precipitation?: number | null
          source?: string
          temp_max?: number | null
          temp_min?: number | null
          wind_gust?: number | null
          wind_speed?: number | null
        }
        Relationships: []
      }
      weather_observed_daily: {
        Row: {
          created_at: string
          day_date: string
          id: number
          location_id: string
          observed: Json
          source: string
        }
        Insert: {
          created_at?: string
          day_date: string
          id?: number
          location_id: string
          observed: Json
          source?: string
        }
        Update: {
          created_at?: string
          day_date?: string
          id?: number
          location_id?: string
          observed?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_observed_daily_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_raw_daily: {
        Row: {
          created_at: string
          day_date: string
          id: number
          location_id: string
          payload: Json
          run_at: string
          source_id: string
        }
        Insert: {
          created_at?: string
          day_date: string
          id?: number
          location_id: string
          payload: Json
          run_at?: string
          source_id: string
        }
        Update: {
          created_at?: string
          day_date?: string
          id?: number
          location_id?: string
          payload?: Json
          run_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_raw_daily_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_raw_daily_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "weather_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_source_scores: {
        Row: {
          created_at: string
          day_date: string
          id: number
          location_id: string
          mae_precip: number
          mae_snow: number
          mae_temp: number
          mae_wind: number
          source_id: string
          total_score: number
        }
        Insert: {
          created_at?: string
          day_date: string
          id?: number
          location_id: string
          mae_precip: number
          mae_snow: number
          mae_temp: number
          mae_wind: number
          source_id: string
          total_score: number
        }
        Update: {
          created_at?: string
          day_date?: string
          id?: number
          location_id?: string
          mae_precip?: number
          mae_snow?: number
          mae_temp?: number
          mae_wind?: number
          source_id?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "weather_source_scores_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "weather_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_source_scores_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "weather_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      members_safe: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string | null
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      rpc_apply_overdue: { Args: { p_event_id: string }; Returns: Json }
      rpc_check_bonus_token: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      rpc_check_shot_ban: { Args: never; Returns: Json }
      rpc_confirm_shot:
        | { Args: { p_event_id: string; p_mode: string }; Returns: Json }
        | {
            Args: { p_event_id: string; p_mode: string; p_witness_id?: string }
            Returns: Json
          }
      rpc_finalize_countdown: { Args: { p_event_id: string }; Returns: Json }
      rpc_get_all_shot_tokens: { Args: never; Returns: Json }
      rpc_get_shot_leaderboard: {
        Args: { p_days?: number; p_group_id?: string }
        Returns: Json
      }
      rpc_get_shot_tokens: { Args: never; Returns: Json }
      rpc_start_shot_round: { Args: { p_group_id?: string }; Returns: Json }
    }
    Enums: {
      app_role: "user" | "admin"
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
  public: {
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const
