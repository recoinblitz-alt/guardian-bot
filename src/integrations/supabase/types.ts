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
      bot_settings: {
        Row: {
          alert_channel_id: string
          alert_role_id: string
          bot_api_key: string
          bot_last_seen: string | null
          bot_status: Json
          category_weights: Json
          deepgram_keys: string[]
          discord_token: string
          fuzzy_matching: boolean
          id: number
          ignored_role_ids: string[]
          ignored_user_ids: string[]
          ladder: Json
          log_channel_id: string
          min_confidence: number
          min_confidence_short: number
          server_words: string[]
          sexual_instant_ban: boolean
          text_all_channels: boolean
          text_channel_ids: string[]
          updated_at: string
          voice_channel_ids: string[]
          warning_expiry_days: number
        }
        Insert: {
          alert_channel_id?: string
          alert_role_id?: string
          bot_api_key?: string
          bot_last_seen?: string | null
          bot_status?: Json
          category_weights?: Json
          deepgram_keys?: string[]
          discord_token?: string
          fuzzy_matching?: boolean
          id?: number
          ignored_role_ids?: string[]
          ignored_user_ids?: string[]
          ladder?: Json
          log_channel_id?: string
          min_confidence?: number
          min_confidence_short?: number
          server_words?: string[]
          sexual_instant_ban?: boolean
          text_all_channels?: boolean
          text_channel_ids?: string[]
          updated_at?: string
          voice_channel_ids?: string[]
          warning_expiry_days?: number
        }
        Update: {
          alert_channel_id?: string
          alert_role_id?: string
          bot_api_key?: string
          bot_last_seen?: string | null
          bot_status?: Json
          category_weights?: Json
          deepgram_keys?: string[]
          discord_token?: string
          fuzzy_matching?: boolean
          id?: number
          ignored_role_ids?: string[]
          ignored_user_ids?: string[]
          ladder?: Json
          log_channel_id?: string
          min_confidence?: number
          min_confidence_short?: number
          server_words?: string[]
          sexual_instant_ban?: boolean
          text_all_channels?: boolean
          text_channel_ids?: string[]
          updated_at?: string
          voice_channel_ids?: string[]
          warning_expiry_days?: number
        }
        Relationships: []
      }
      infractions: {
        Row: {
          action: string
          category: string
          channel_name: string
          cleared: boolean
          created_at: string
          discord_user_id: string
          duration_seconds: number
          id: string
          matched: string
          points: number
          transcript: string
          username: string
        }
        Insert: {
          action: string
          category: string
          channel_name?: string
          cleared?: boolean
          created_at?: string
          discord_user_id: string
          duration_seconds?: number
          id?: string
          matched?: string
          points?: number
          transcript?: string
          username?: string
        }
        Update: {
          action?: string
          category?: string
          channel_name?: string
          cleared?: boolean
          created_at?: string
          discord_user_id?: string
          duration_seconds?: number
          id?: string
          matched?: string
          points?: number
          transcript?: string
          username?: string
        }
        Relationships: []
      }
      slang_words: {
        Row: {
          category: string
          created_at: string
          id: string
          language: string
          word: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          language?: string
          word: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          language?: string
          word?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
