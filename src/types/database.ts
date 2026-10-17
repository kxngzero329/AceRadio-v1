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
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          notifications_enabled?: boolean
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          notifications_enabled?: boolean
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
      is_account_admin: { Args: never; Returns: boolean }
      is_content_editor: { Args: never; Returns: boolean }
      is_verified_account: { Args: never; Returns: boolean }
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
