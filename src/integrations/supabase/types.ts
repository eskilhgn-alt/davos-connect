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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_corrections: {
        Row: {
          admin_id: string
          correction_type: string
          created_at: string
          id: string
          payload: Json
          target_user_id: string | null
          witness_approved: boolean | null
          witness_id: string | null
          witness_responded_at: string | null
        }
        Insert: {
          admin_id: string
          correction_type: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
          witness_approved?: boolean | null
          witness_id?: string | null
          witness_responded_at?: string | null
        }
        Update: {
          admin_id?: string
          correction_type?: string
          created_at?: string
          id?: string
          payload?: Json
          target_user_id?: string | null
          witness_approved?: boolean | null
          witness_id?: string | null
          witness_responded_at?: string | null
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          note: string
          target_user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          note: string
          target_user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          note?: string
          target_user_id?: string
        }
        Relationships: []
      }
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
          trip_id: string
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
          trip_id?: string
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
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          file_size: number | null
          filename: string | null
          height: number | null
          id: string
          message_id: string
          mime_type: string | null
          storage_bucket: string
          storage_path: string
          thumbnail_path: string | null
          type: string
          width: number | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          filename?: string | null
          height?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
          thumbnail_path?: string | null
          type: string
          width?: number | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          filename?: string | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
          thumbnail_path?: string | null
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
      bug_reports: {
        Row: {
          created_at: string
          id: string
          message: string
          page_url: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      debt_settlements: {
        Row: {
          amount: number
          client_id: string | null
          created_by: string
          currency: string
          from_user_id: string
          id: string
          note: string | null
          settled_at: string
          to_user_id: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_by: string
          currency?: string
          from_user_id: string
          id?: string
          note?: string | null
          settled_at?: string
          to_user_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_by?: string
          currency?: string
          from_user_id?: string
          id?: string
          note?: string | null
          settled_at?: string
          to_user_id?: string
        }
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          expires_at: string
          last_sent_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          last_sent_at?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          last_sent_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_verification_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "members_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_verification_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faktasjekker_messages: {
        Row: {
          completed_at: string | null
          confidence: number | null
          content: string
          created_at: string
          error_code: string | null
          id: string
          model: string | null
          request_id: string | null
          response_id: string | null
          role: string
          sources: Json
          status: string
          thread_id: string
          verdict: string | null
        }
        Insert: {
          completed_at?: string | null
          confidence?: number | null
          content?: string
          created_at?: string
          error_code?: string | null
          id?: string
          model?: string | null
          request_id?: string | null
          response_id?: string | null
          role: string
          sources?: Json
          status?: string
          thread_id: string
          verdict?: string | null
        }
        Update: {
          completed_at?: string | null
          confidence?: number | null
          content?: string
          created_at?: string
          error_code?: string | null
          id?: string
          model?: string | null
          request_id?: string | null
          response_id?: string | null
          role?: string
          sources?: Json
          status?: string
          thread_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "faktasjekker_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "faktasjekker_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      faktasjekker_rate_limits: {
        Row: {
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
          window_type: string
        }
        Insert: {
          request_count?: number
          updated_at?: string
          user_id: string
          window_start: string
          window_type: string
        }
        Update: {
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
          window_type?: string
        }
        Relationships: []
      }
      faktasjekker_threads: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          model: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          model?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          model?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      gallery_comments: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          item_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gallery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_items: {
        Row: {
          caption: string | null
          created_at: string
          height: number | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          source_message_id: string | null
          source_story_id: string | null
          storage_bucket: string
          storage_path: string
          thumbnail_path: string | null
          trip_id: string
          type: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source_message_id?: string | null
          source_story_id?: string | null
          storage_bucket: string
          storage_path: string
          thumbnail_path?: string | null
          trip_id?: string
          type: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source_message_id?: string | null
          source_story_id?: string | null
          storage_bucket?: string
          storage_path?: string
          thumbnail_path?: string | null
          trip_id?: string
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
          {
            foreignKeyName: "gallery_items_source_story_id_fkey"
            columns: ["source_story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_likes: {
        Row: {
          created_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_likes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gallery_items"
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
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
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
          reply_to_id: string | null
          sender_id: string
          sender_name: string
          text: string
          thread_id: string
          trip_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reactions?: Json | null
          reply_to_id?: string | null
          sender_id: string
          sender_name: string
          text?: string
          thread_id: string
          trip_id?: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reactions?: Json | null
          reply_to_id?: string | null
          sender_id?: string
          sender_name?: string
          text?: string
          thread_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dispatches: {
        Row: {
          claimed_at: string
          dedupe_key: string
          event_type: string
          kind: string
          last_error: string | null
          sent_at: string | null
          source_id: string | null
        }
        Insert: {
          claimed_at?: string
          dedupe_key: string
          event_type: string
          kind: string
          last_error?: string | null
          sent_at?: string | null
          source_id?: string | null
        }
        Update: {
          claimed_at?: string
          dedupe_key?: string
          event_type?: string
          kind?: string
          last_error?: string | null
          sent_at?: string | null
          source_id?: string | null
        }
        Relationships: []
      }
      place_query_cache: {
        Row: {
          created_at: string
          expires_at: string
          filters: Json | null
          id: string
          lat: number
          lng: number
          location_hash: string
          query_type: string
          radius_m: number
          result_place_ids: Json | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          filters?: Json | null
          id?: string
          lat: number
          lng: number
          location_hash: string
          query_type: string
          radius_m: number
          result_place_ids?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          filters?: Json | null
          id?: string
          lat?: number
          lng?: number
          location_hash?: string
          query_type?: string
          radius_m?: number
          result_place_ids?: Json | null
        }
        Relationships: []
      }
      place_signals: {
        Row: {
          ai_summary: string | null
          date_night_score: number | null
          evidence: Json | null
          group_friendly_score: number | null
          id: string
          local_vibe_score: number | null
          place_id: string
          quality_score: number | null
          quick_bite_score: number | null
          touristy_score: number | null
          updated_at: string
          value_score: number | null
          why_this: string | null
        }
        Insert: {
          ai_summary?: string | null
          date_night_score?: number | null
          evidence?: Json | null
          group_friendly_score?: number | null
          id?: string
          local_vibe_score?: number | null
          place_id: string
          quality_score?: number | null
          quick_bite_score?: number | null
          touristy_score?: number | null
          updated_at?: string
          value_score?: number | null
          why_this?: string | null
        }
        Update: {
          ai_summary?: string | null
          date_night_score?: number | null
          evidence?: Json | null
          group_friendly_score?: number | null
          id?: string
          local_vibe_score?: number | null
          place_id?: string
          quality_score?: number | null
          quick_bite_score?: number | null
          touristy_score?: number | null
          updated_at?: string
          value_score?: number | null
          why_this?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_signals_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: true
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          categories: Json | null
          city: string | null
          country: string | null
          created_at: string
          external_id: string | null
          id: string
          last_synced_at: string | null
          lat: number
          lng: number
          name: string
          opening_hours: Json | null
          phone: string | null
          photo_url: string | null
          price_level: number | null
          rating: number | null
          raw_source_payload: Json | null
          review_count: number | null
          source: string
          website: string | null
        }
        Insert: {
          address?: string | null
          categories?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          lat: number
          lng: number
          name: string
          opening_hours?: Json | null
          phone?: string | null
          photo_url?: string | null
          price_level?: number | null
          rating?: number | null
          raw_source_payload?: Json | null
          review_count?: number | null
          source?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          categories?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          lat?: number
          lng?: number
          name?: string
          opening_hours?: Json | null
          phone?: string | null
          photo_url?: string | null
          price_level?: number | null
          rating?: number | null
          raw_source_payload?: Json | null
          review_count?: number | null
          source?: string
          website?: string | null
        }
        Relationships: []
      }
      points_ledger: {
        Row: {
          created_at: string
          description: string | null
          id: string
          points: number
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          points: number
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          created_at: string
          id: string
          label: string
          poll_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          poll_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          poll_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          created_at: string
          created_by: string
          deadline_at: string | null
          id: string
          is_pinned: boolean
          min_votes: number | null
          question: string
          require_all: boolean
          resolved_at: string | null
          send_push_on_create: boolean
          send_push_on_resolved: boolean
          status: string
          trip_id: string
          updated_at: string
          winning_option_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deadline_at?: string | null
          id?: string
          is_pinned?: boolean
          min_votes?: number | null
          question: string
          require_all?: boolean
          resolved_at?: string | null
          send_push_on_create?: boolean
          send_push_on_resolved?: boolean
          status?: string
          trip_id?: string
          updated_at?: string
          winning_option_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deadline_at?: string | null
          id?: string
          is_pinned?: boolean
          min_votes?: number | null
          question?: string
          require_all?: boolean
          resolved_at?: string | null
          send_push_on_create?: boolean
          send_push_on_resolved?: boolean
          status?: string
          trip_id?: string
          updated_at?: string
          winning_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          created_at: string
          email: string
          email_verification_expires_at: string | null
          email_verification_token: string | null
          email_verified: boolean
          full_name: string | null
          id: string
          is_active: boolean
          is_banned: boolean
          membership_status: Database["public"]["Enums"]["membership_status_type"]
          nickname: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          email: string
          email_verification_expires_at?: string | null
          email_verification_token?: string | null
          email_verified?: boolean
          full_name?: string | null
          id: string
          is_active?: boolean
          is_banned?: boolean
          membership_status?: Database["public"]["Enums"]["membership_status_type"]
          nickname?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          email?: string
          email_verification_expires_at?: string | null
          email_verification_token?: string | null
          email_verified?: boolean
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_banned?: boolean
          membership_status?: Database["public"]["Enums"]["membership_status_type"]
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
      round_participants: {
        Row: {
          created_at: string
          id: string
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_participants_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          buyer_id: string
          client_id: string | null
          cost_per_person: number
          created_at: string
          currency: string
          drink_quantities: Json
          drink_type: string
          id: string
          is_treated: boolean
          note: string | null
          push_claimed_at: string | null
          push_sent_at: string | null
          receipt_image_url: string | null
          receipt_uploaded_by: string | null
          total_cost: number
          trip_id: string
        }
        Insert: {
          buyer_id: string
          client_id?: string | null
          cost_per_person?: number
          created_at?: string
          currency?: string
          drink_quantities?: Json
          drink_type: string
          id?: string
          is_treated?: boolean
          note?: string | null
          push_claimed_at?: string | null
          push_sent_at?: string | null
          receipt_image_url?: string | null
          receipt_uploaded_by?: string | null
          total_cost?: number
          trip_id?: string
        }
        Update: {
          buyer_id?: string
          client_id?: string | null
          cost_per_person?: number
          created_at?: string
          currency?: string
          drink_quantities?: Json
          drink_type?: string
          id?: string
          is_treated?: boolean
          note?: string | null
          push_claimed_at?: string | null
          push_sent_at?: string | null
          receipt_image_url?: string | null
          receipt_uploaded_by?: string | null
          total_cost?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
          admin_reason: string | null
          admin_verdict: string | null
          checker_reason: string | null
          checker_verdict: string | null
          chosen_witness_id: string | null
          confirmed_at: string | null
          countdown_ends_at: string | null
          created_at: string
          deadline_at: string | null
          dispute_details: string | null
          dispute_reason: string | null
          dispute_resolved_at: string | null
          dispute_resolved_by: string | null
          group_id: string
          id: string
          monster_round_id: string | null
          punishment_applied_at: string | null
          punishment_deadline_at: string | null
          random_checker_id: string | null
          selected_at: string | null
          selected_user_id: string | null
          self_confirmed: boolean | null
          started_by: string | null
          status: string
          witness_confirmed_at: string | null
          witness_confirmed_by: string | null
        }
        Insert: {
          admin_reason?: string | null
          admin_verdict?: string | null
          checker_reason?: string | null
          checker_verdict?: string | null
          chosen_witness_id?: string | null
          confirmed_at?: string | null
          countdown_ends_at?: string | null
          created_at?: string
          deadline_at?: string | null
          dispute_details?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          group_id?: string
          id?: string
          monster_round_id?: string | null
          punishment_applied_at?: string | null
          punishment_deadline_at?: string | null
          random_checker_id?: string | null
          selected_at?: string | null
          selected_user_id?: string | null
          self_confirmed?: boolean | null
          started_by?: string | null
          status?: string
          witness_confirmed_at?: string | null
          witness_confirmed_by?: string | null
        }
        Update: {
          admin_reason?: string | null
          admin_verdict?: string | null
          checker_reason?: string | null
          checker_verdict?: string | null
          chosen_witness_id?: string | null
          confirmed_at?: string | null
          countdown_ends_at?: string | null
          created_at?: string
          deadline_at?: string | null
          dispute_details?: string | null
          dispute_reason?: string | null
          dispute_resolved_at?: string | null
          dispute_resolved_by?: string | null
          group_id?: string
          id?: string
          monster_round_id?: string | null
          punishment_applied_at?: string | null
          punishment_deadline_at?: string | null
          random_checker_id?: string | null
          selected_at?: string | null
          selected_user_id?: string | null
          self_confirmed?: boolean | null
          started_by?: string | null
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
          shot_banned_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          last_refill_at?: string
          shot_banned_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          last_refill_at?: string
          shot_banned_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ski_altitude_samples: {
        Row: {
          altitude: number
          id: string
          lat: number | null
          lon: number | null
          recorded_at: string
          speed: number | null
          user_id: string
        }
        Insert: {
          altitude: number
          id?: string
          lat?: number | null
          lon?: number | null
          recorded_at?: string
          speed?: number | null
          user_id: string
        }
        Update: {
          altitude?: number
          id?: string
          lat?: number | null
          lon?: number | null
          recorded_at?: string
          speed?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ski_daily_awards: {
        Row: {
          claimed: boolean
          claimed_at: string | null
          created_at: string
          day_date: string
          id: string
          reward_type: string | null
          user_id: string
          vertical_meters: number
        }
        Insert: {
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          day_date: string
          id?: string
          reward_type?: string | null
          user_id: string
          vertical_meters: number
        }
        Update: {
          claimed?: boolean
          claimed_at?: string | null
          created_at?: string
          day_date?: string
          id?: string
          reward_type?: string | null
          user_id?: string
          vertical_meters?: number
        }
        Relationships: []
      }
      ski_daily_vertical: {
        Row: {
          day_date: string
          id: string
          sample_count: number
          updated_at: string
          user_id: string
          vertical_meters: number
        }
        Insert: {
          day_date?: string
          id?: string
          sample_count?: number
          updated_at?: string
          user_id: string
          vertical_meters?: number
        }
        Update: {
          day_date?: string
          id?: string
          sample_count?: number
          updated_at?: string
          user_id?: string
          vertical_meters?: number
        }
        Relationships: []
      }
      ski_speed_records: {
        Row: {
          altitude_m: number | null
          day_date: string
          id: string
          lat: number | null
          lon: number | null
          max_speed_kmh: number
          recorded_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          altitude_m?: number | null
          day_date?: string
          id?: string
          lat?: number | null
          lon?: number | null
          max_speed_kmh?: number
          recorded_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          altitude_m?: number | null
          day_date?: string
          id?: string
          lat?: number | null
          lon?: number | null
          max_speed_kmh?: number
          recorded_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ski_track_points: {
        Row: {
          altitude: number
          day_date: string
          direction: string
          id: string
          lat: number
          lon: number
          recorded_at: string
          speed: number | null
          user_id: string
        }
        Insert: {
          altitude: number
          day_date?: string
          direction?: string
          id?: string
          lat: number
          lon: number
          recorded_at?: string
          speed?: number | null
          user_id: string
        }
        Update: {
          altitude?: number
          day_date?: string
          direction?: string
          id?: string
          lat?: number
          lon?: number
          recorded_at?: string
          speed?: number | null
          user_id?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          created_at: string
          duration_sec: number | null
          expires_at: string
          id: string
          storage_path: string
          trip_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          expires_at?: string
          id?: string
          storage_path: string
          trip_id?: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          expires_at?: string
          id?: string
          storage_path?: string
          trip_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      story_likes: {
        Row: {
          created_at: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          type?: string
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
      token_ledger: {
        Row: {
          created_at: string
          delta: number
          description: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          description?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          description?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      trip_members: {
        Row: {
          added_at: string
          added_by: string | null
          trip_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          trip_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          destination_config: Json
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination: string
          destination_config?: Json
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination?: string
          destination_config?: Json
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_frikort: {
        Row: {
          earned_at: string
          id: string
          reason: string
          used_at: string | null
          used_event_id: string | null
          user_id: string
        }
        Insert: {
          earned_at?: string
          id?: string
          reason?: string
          used_at?: string | null
          used_event_id?: string | null
          user_id: string
        }
        Update: {
          earned_at?: string
          id?: string
          reason?: string
          used_at?: string | null
          used_event_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_frikort_used_event_id_fkey"
            columns: ["used_event_id"]
            isOneToOne: false
            referencedRelation: "shot_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          lat: number
          lon: number
          updated_at: string
          user_id: string
        }
        Insert: {
          lat: number
          lon: number
          updated_at?: string
          user_id: string
        }
        Update: {
          lat?: number
          lon?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          total_points?: number
          updated_at?: string
          user_id?: string
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
      user_streaks: {
        Row: {
          best_streak: number
          current_streak: number
          last_active_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          current_streak?: number
          last_active_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          current_streak?: number
          last_active_date?: string | null
          updated_at?: string
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
          avatar_url: string | null
          full_name: string | null
          id: string | null
          membership_status:
            | Database["public"]["Enums"]["membership_status_type"]
            | null
          nickname: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          membership_status?:
            | Database["public"]["Enums"]["membership_status_type"]
            | null
          nickname?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          membership_status?:
            | Database["public"]["Enums"]["membership_status_type"]
            | null
          nickname?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      active_trip_id: { Args: never; Returns: string }
      consume_email_verification_token: {
        Args: { p_token_hash: string }
        Returns: {
          status: string
          verified_user_id: string
        }[]
      }
      consume_faktasjekker_quota: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      create_poll_with_options: {
        Args: {
          p_deadline_at?: string
          p_min_votes?: number
          p_options: string[]
          p_question: string
          p_require_all?: boolean
          p_send_push_on_create?: boolean
          p_send_push_on_resolved?: boolean
        }
        Returns: string
      }
      create_round_with_participants: {
        Args: {
          p_client_id: string
          p_currency?: string
          p_drink_quantities?: Json
          p_drink_type: string
          p_is_treated?: boolean
          p_note?: string
          p_participant_ids: string[]
          p_receipt_path?: string
          p_total_cost: number
        }
        Returns: {
          buyer_id: string
          client_id: string | null
          cost_per_person: number
          created_at: string
          currency: string
          drink_quantities: Json
          drink_type: string
          id: string
          is_treated: boolean
          note: string | null
          push_claimed_at: string | null
          push_sent_at: string | null
          receipt_image_url: string | null
          receipt_uploaded_by: string | null
          total_cost: number
          trip_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rounds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_approved_member: { Args: { _uid: string }; Returns: boolean }
      is_trip_member: {
        Args: { _trip_id: string; _user_id: string }
        Returns: boolean
      }
      rpc_admin_add_trip_member: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      rpc_admin_adjust_tokens: {
        Args: { p_delta: number; p_reason: string; p_user_id: string }
        Returns: Json
      }
      rpc_admin_approve_member: { Args: { p_user_id: string }; Returns: Json }
      rpc_admin_archive_trip: {
        Args: { p_trip_id: string }
        Returns: {
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          destination_config: Json
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_admin_create_trip: {
        Args: {
          p_country?: string
          p_currency?: string
          p_destination: string
          p_destination_config?: Json
          p_end_date?: string
          p_name: string
          p_start_date?: string
          p_timezone?: string
        }
        Returns: {
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          destination_config: Json
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_admin_remove_trip_member: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      rpc_admin_reset_shot_event: {
        Args: { p_event_id: string }
        Returns: Json
      }
      rpc_admin_resolve_shot: {
        Args: { p_event_id: string; p_reason?: string; p_verdict: string }
        Returns: Json
      }
      rpc_admin_set_active_trip: {
        Args: { p_trip_id: string }
        Returns: {
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          destination_config: Json
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_admin_set_ban: {
        Args: { p_banned: boolean; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      rpc_admin_unban_shot: { Args: { p_user_id: string }; Returns: Json }
      rpc_admin_update_trip: {
        Args: {
          p_country?: string
          p_currency?: string
          p_destination?: string
          p_destination_config?: Json
          p_end_date?: string
          p_name?: string
          p_start_date?: string
          p_timezone?: string
          p_trip_id: string
        }
        Returns: {
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination: string
          destination_config: Json
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_apply_overdue: { Args: { p_event_id: string }; Returns: Json }
      rpc_apply_punishment_ban: { Args: { p_event_id: string }; Returns: Json }
      rpc_award_points: {
        Args: {
          p_description?: string
          p_points: number
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
      rpc_check_shot_ban: { Args: never; Returns: Json }
      rpc_checker_verdict: {
        Args: { p_event_id: string; p_reason?: string; p_verdict: string }
        Returns: Json
      }
      rpc_claim_ski_award: {
        Args: { p_award_id: string; p_choice: string }
        Returns: Json
      }
      rpc_confirm_shot: {
        Args: {
          p_dispute_details?: string
          p_dispute_reason?: string
          p_event_id: string
          p_mode: string
          p_witness_id?: string
        }
        Returns: Json
      }
      rpc_finalize_countdown: { Args: { p_event_id: string }; Returns: Json }
      rpc_get_all_shot_tokens: { Args: never; Returns: Json }
      rpc_get_gamification_leaderboard: { Args: never; Returns: Json }
      rpc_get_own_profile: {
        Args: never
        Returns: {
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          created_at: string
          email: string
          email_verification_expires_at: string | null
          email_verification_token: string | null
          email_verified: boolean
          full_name: string | null
          id: string
          is_active: boolean
          is_banned: boolean
          membership_status: Database["public"]["Enums"]["membership_status_type"]
          nickname: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_get_points_leaderboard: { Args: { p_days?: number }; Returns: Json }
      rpc_get_shot_leaderboard: {
        Args: { p_days?: number; p_group_id?: string }
        Returns: Json
      }
      rpc_get_shot_tokens: { Args: never; Returns: Json }
      rpc_get_ski_leaderboard: { Args: { p_days?: number }; Returns: Json }
      rpc_record_ski_sample: {
        Args: {
          p_altitude: number
          p_lat?: number
          p_lon?: number
          p_speed: number
        }
        Returns: Json
      }
      rpc_start_shot_round: { Args: { p_group_id?: string }; Returns: Json }
      rpc_start_shot_simple: { Args: { p_group_id?: string }; Returns: Json }
      rpc_use_frikort: { Args: { p_event_id: string }; Returns: Json }
      start_faktasjekk: {
        Args: {
          p_claim: string
          p_request_id: string
          p_thread_id: string
          p_user_id: string
        }
        Returns: {
          assistant_message_id: string
          created_at: string
          existing: boolean
          thread_id: string
          user_message_id: string
        }[]
      }
    }
    Enums: {
      app_role: "user" | "admin"
      membership_status_type: "pending" | "approved" | "banned"
      trip_status: "active" | "archived"
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
      membership_status_type: ["pending", "approved", "banned"],
      trip_status: ["active", "archived"],
    },
  },
} as const
