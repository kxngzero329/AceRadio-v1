// Generated from the linked public schema. Refresh with npm run backend:types.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          ends_at: string | null
          id: string
          link_url: string | null
          priority: number
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          ends_at?: string | null
          id?: string
          link_url?: string | null
          priority?: number
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          link_url?: string | null
          priority?: number
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          display_order: number
          ends_at: string | null
          external_id: string | null
          id: string
          image_id: string
          link_url: string | null
          placement: string
          show_id: string | null
          source_system: string
          starts_at: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          ends_at?: string | null
          external_id?: string | null
          id: string
          image_id: string
          link_url?: string | null
          placement?: string
          show_id?: string | null
          source_system?: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          ends_at?: string | null
          external_id?: string | null
          id?: string
          image_id?: string
          link_url?: string | null
          placement?: string
          show_id?: string | null
          source_system?: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_guests: {
        Row: {
          booking_id: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string
          position: number
        }
        Insert: {
          booking_id: string
          email: string
          first_name: string
          id?: string
          last_name: string
          phone: string
          position: number
        }
        Update: {
          booking_id?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "ticket_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rate_limits: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          created_at: string
          email: string
          event_id: string | null
          id: string
          message: string
          name: string
          phone: string | null
          preferred_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id?: string | null
          id: string
          message: string
          name: string
          phone?: string | null
          preferred_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string | null
          id?: string
          message?: string
          name?: string
          phone?: string | null
          preferred_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_types: {
        Row: {
          capacity: number | null
          created_at: string
          currency: string
          description: string
          display_order: number
          event_id: string
          guests_per_unit: number
          id: string
          name: string
          price_cents: number
          status: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          currency?: string
          description?: string
          display_order?: number
          event_id: string
          guests_per_unit?: number
          id?: string
          name: string
          price_cents: number
          status?: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          currency?: string
          description?: string
          display_order?: number
          event_id?: string
          guests_per_unit?: number
          id?: string
          name?: string
          price_cents?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          booking_url: string | null
          created_at: string
          description: string
          ends_at: string | null
          id: string
          image_url: string | null
          location: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booking_url?: string | null
          created_at?: string
          description?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booking_url?: string | null
          created_at?: string
          description?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt_text: string | null
          bucket_id: string
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          sha256: string | null
          source_url: string | null
          status: string
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket_id: string
          created_at?: string
          height?: number | null
          id: string
          mime_type: string
          object_path: string
          sha256?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket_id?: string
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          object_path?: string
          sha256?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      presenters: {
        Row: {
          bio: string | null
          created_at: string
          external_id: string | null
          id: string
          name: string
          photo_id: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          external_id?: string | null
          id: string
          name: string
          photo_id?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          photo_id?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presenters_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      show_presenters: {
        Row: {
          position: number
          presenter_id: string
          show_id: string
        }
        Insert: {
          position?: number
          presenter_id: string
          show_id: string
        }
        Update: {
          position?: number
          presenter_id?: string
          show_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "show_presenters_presenter_id_fkey"
            columns: ["presenter_id"]
            isOneToOne: false
            referencedRelation: "presenters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_presenters_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      show_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          ends_at: string
          id: string
          show_id: string
          starts_at: string
          timezone: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          day_of_week: number
          ends_at: string
          id: string
          show_id: string
          starts_at: string
          timezone?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          ends_at?: string
          id?: string
          show_id?: string
          starts_at?: string
          timezone?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_schedules_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          accent: string
          artwork_id: string | null
          category: string | null
          created_at: string
          description: string | null
          display_order: number
          external_id: string | null
          id: string
          poster_id: string | null
          source_payload: Json
          source_system: string
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent?: string
          artwork_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          external_id?: string | null
          id: string
          poster_id?: string | null
          source_payload?: Json
          source_system?: string
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accent?: string
          artwork_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          external_id?: string | null
          id?: string
          poster_id?: string | null
          source_payload?: Json
          source_system?: string
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shows_artwork_id_fkey"
            columns: ["artwork_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_poster_id_fkey"
            columns: ["poster_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_bookings: {
        Row: {
          created_at: string
          currency: string
          email: string
          event_id: string
          event_title: string
          first_name: string
          guests_per_unit: number
          id: string
          last_name: string
          payment_status: string
          phone: string
          quantity: number
          reference: string
          request_hash: string
          status: string
          ticket_name: string
          ticket_type_id: string
          total_cents: number
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          email: string
          event_id: string
          event_title: string
          first_name: string
          guests_per_unit: number
          id: string
          last_name: string
          payment_status?: string
          phone: string
          quantity: number
          reference: string
          request_hash: string
          status?: string
          ticket_name: string
          ticket_type_id: string
          total_cents: number
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          email?: string
          event_id?: string
          event_title?: string
          first_name?: string
          guests_per_unit?: number
          id?: string
          last_name?: string
          payment_status?: string
          phone?: string
          quantity?: number
          reference?: string
          request_hash?: string
          status?: string
          ticket_name?: string
          ticket_type_id?: string
          total_cents?: number
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_bookings_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "event_ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          is_favorite: boolean
          revision: number
          show_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          is_favorite?: boolean
          revision?: number
          show_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          is_favorite?: boolean
          revision?: number
          show_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          notifications_enabled: boolean
          reminder_lead_minutes: number
          reminder_scope: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          notifications_enabled?: boolean
          reminder_lead_minutes?: number
          reminder_scope?: string
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          notifications_enabled?: boolean
          reminder_lead_minutes?: number
          reminder_scope?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_account_changes: { Args: { changes: Json }; Returns: Json }
      assert_account_deletion_allowed: { Args: never; Returns: boolean }
      get_account_data: { Args: never; Returns: Json }
      get_app_content: { Args: never; Returns: Json }
      get_app_content_v2: { Args: never; Returns: Json }
      get_app_content_v3: { Args: never; Returns: Json }
      get_event_ticket_availability: {
        Args: { event_id: string }
        Returns: Json
      }
      get_website_content: { Args: never; Returns: Json }
      is_account_admin: { Args: never; Returns: boolean }
      is_content_editor: { Args: never; Returns: boolean }
      is_verified_account: { Args: never; Returns: boolean }
      push_claim_jobs: {
        Args: { p_allowed?: string[]; p_at?: string; p_environment: string }
        Returns: Json
      }
      push_cleanup: { Args: never; Returns: undefined }
      push_due_candidates: {
        Args: { p_at?: string }
        Returns: {
          device_id: string
          ends_at: string
          environment: string
          expires_at: string
          show_id: string
          starts_at: string
          title: string
          token: string
        }[]
      }
      push_finish_job: {
        Args: {
          p_error?: string
          p_id: string
          p_lease: string
          p_state: string
          p_ticket?: string
        }
        Returns: undefined
      }
      push_finish_receipt: {
        Args: { p_error?: string; p_id: string; p_result: string }
        Returns: undefined
      }
      push_hit_limit: {
        Args: { p_bucket: string; p_max: number; p_seconds: number }
        Returns: boolean
      }
      push_pending_receipts: { Args: never; Returns: Json }
      push_register_device: {
        Args: {
          p_enabled: boolean
          p_environment: string
          p_favorites: string[]
          p_hash: string
          p_id: string
          p_one_time: Json
          p_platform: string
          p_preferences: Json
          p_sequence: number
          p_token: string
          p_user: string
        }
        Returns: Json
      }
      push_worker_lock: {
        Args: { p_environment: string; p_lease: string }
        Returns: boolean
      }
      push_worker_unlock: {
        Args: { p_environment: string; p_lease: string }
        Returns: undefined
      }
      reserve_event_tickets: {
        Args: { details: Json; request_id: string; visitor_key: string }
        Returns: Json
      }
      reserve_website_tickets: {
        Args: { details: Json; request_id: string }
        Returns: Json
      }
      submit_booking_request: {
        Args: { details: Json; request_id: string; visitor_key: string }
        Returns: string
      }
      submit_website_booking_request: {
        Args: { details: Json; request_id: string }
        Returns: string
      }
      update_ticket_booking: {
        Args: {
          booking_id: string
          new_payment_status: string
          new_status: string
        }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
