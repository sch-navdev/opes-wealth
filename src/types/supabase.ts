// Auto-generated from the live Supabase schema (project lpaollycwokxejrihrap)
// via the Supabase MCP's `generate_typescript_types`. Regenerate after any
// schema change rather than hand-editing — this file mirrors `information_schema`
// exactly, including the `metadata`/`images` `Json` columns that carry
// category-specific shapes (see `src/lib/real-estate.ts`, `src/lib/vehicles.ts`,
// `src/lib/private-equity.ts` for the typed shapes those `Json` blobs hold).

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      asset_history: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          net_equity: number | null
          recorded_date: string
          source: string | null
          value: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          net_equity?: number | null
          recorded_date: string
          source?: string | null
          value: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          net_equity?: number | null
          recorded_date?: string
          source?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          category_id: string
          created_at: string
          currency: string
          current_value: number
          id: string
          images: Json | null
          is_liability: boolean
          metadata: Json
          name: string
          profile_id: string
          purchase_date: string
          quantity: number
          ticker_symbol: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          currency?: string
          current_value: number
          id?: string
          images?: Json | null
          is_liability?: boolean
          metadata?: Json
          name: string
          profile_id: string
          purchase_date?: string
          quantity?: number
          ticker_symbol?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          currency?: string
          current_value?: number
          id?: string
          images?: Json | null
          is_liability?: boolean
          metadata?: Json
          name?: string
          profile_id?: string
          purchase_date?: string
          quantity?: number
          ticker_symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          id: string
          profile_id: string
          provider: string
          institution_id: string
          institution_name: string
          status: string
          is_sandbox: boolean
          consent_id: string | null
          consent_expires_at: string | null
          oauth_state: string | null
          encrypted_code_verifier: string | null
          oauth_started_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          token_expires_at: string | null
          last_synced_at: string | null
          last_sync_status: string | null
          last_sync_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          provider?: string
          institution_id: string
          institution_name: string
          status?: string
          is_sandbox?: boolean
          consent_id?: string | null
          consent_expires_at?: string | null
          oauth_state?: string | null
          encrypted_code_verifier?: string | null
          oauth_started_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          token_expires_at?: string | null
          last_synced_at?: string | null
          last_sync_status?: string | null
          last_sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          provider?: string
          institution_id?: string
          institution_name?: string
          status?: string
          is_sandbox?: boolean
          consent_id?: string | null
          consent_expires_at?: string | null
          oauth_state?: string | null
          encrypted_code_verifier?: string | null
          oauth_started_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          token_expires_at?: string | null
          last_synced_at?: string | null
          last_sync_status?: string | null
          last_sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      asset_owners: {
        Row: {
          id: string
          asset_id: string
          profile_id: string | null
          name: string
          email: string | null
          ownership_percentage: number
          is_creator: boolean
          invited_at: string | null
          invite_status: string
          invite_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          profile_id?: string | null
          name?: string
          email?: string | null
          ownership_percentage: number
          is_creator?: boolean
          invited_at?: string | null
          invite_status?: string
          invite_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          profile_id?: string | null
          name?: string
          email?: string | null
          ownership_percentage?: number
          is_creator?: boolean
          invited_at?: string | null
          invite_status?: string
          invite_error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      asset_change_requests: {
        Row: {
          id: string
          asset_id: string
          requested_by: string
          proposed_payload: Json
          status: string
          auto_approved: boolean
          created_at: string
          expires_at: string
          resolved_at: string | null
        }
        Insert: {
          id?: string
          asset_id: string
          requested_by: string
          proposed_payload: Json
          status?: string
          auto_approved?: boolean
          created_at?: string
          expires_at?: string
          resolved_at?: string | null
        }
        Update: {
          id?: string
          asset_id?: string
          requested_by?: string
          proposed_payload?: Json
          status?: string
          auto_approved?: boolean
          created_at?: string
          expires_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      change_approvals: {
        Row: {
          id: string
          change_request_id: string
          profile_id: string
          status: string
          decided_at: string | null
          notify_status: string
          notified_at: string | null
          notify_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          change_request_id: string
          profile_id: string
          status?: string
          decided_at?: string | null
          notify_status?: string
          notified_at?: string | null
          notify_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          change_request_id?: string
          profile_id?: string
          status?: string
          decided_at?: string | null
          notify_status?: string
          notified_at?: string | null
          notify_error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      client_knowledge_documents: {
        Row: {
          profile_id: string
          data: Json
          updated_at: string
        }
        Insert: {
          profile_id: string
          data?: Json
          updated_at?: string
        }
        Update: {
          profile_id?: string
          data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          profile_id: string
          asset_id: string
          fingerprint: string
          booked_date: string
          amount: number
          currency: string
          description: string
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          asset_id: string
          fingerprint: string
          booked_date: string
          amount: number
          currency: string
          description?: string
          source?: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          asset_id?: string
          fingerprint?: string
          booked_date?: string
          amount?: number
          currency?: string
          description?: string
          source?: string
          created_at?: string
        }
        Relationships: []
      }
      bank_account_links: {
        Row: {
          id: string
          profile_id: string
          connection_id: string
          asset_id: string | null
          is_sandbox: boolean
          external_account_id: string
          account_label: string | null
          masked_number: string | null
          currency: string | null
          last_balance: number | null
          last_synced_at: string | null
          last_sync_status: string | null
          last_sync_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          connection_id: string
          asset_id?: string | null
          is_sandbox?: boolean
          external_account_id: string
          account_label?: string | null
          masked_number?: string | null
          currency?: string | null
          last_balance?: number | null
          last_synced_at?: string | null
          last_sync_status?: string | null
          last_sync_error?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          connection_id?: string
          asset_id?: string | null
          is_sandbox?: boolean
          external_account_id?: string
          account_label?: string | null
          masked_number?: string | null
          currency?: string | null
          last_balance?: number | null
          last_synced_at?: string | null
          last_sync_status?: string | null
          last_sync_error?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_landmark: string | null
          address_po_box: string | null
          address_postal_code: string | null
          address_street: string | null
          avatar_base64: string | null
          created_at: string
          default_currency: string
          first_name: string | null
          id: string
          last_name: string | null
          phone_number: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_landmark?: string | null
          address_po_box?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          avatar_base64?: string | null
          created_at?: string
          default_currency?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone_number?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_landmark?: string | null
          address_po_box?: string | null
          address_postal_code?: string | null
          address_street?: string | null
          avatar_base64?: string | null
          created_at?: string
          default_currency?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      profile_id_for_email: {
        Args: { p_email: string }
        Returns: string | null
      }
      list_my_sessions: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          created_at: string
          last_active_at: string
          user_agent: string | null
          ip: string | null
          aal: string | null
          is_current: boolean
        }[]
      }
      revoke_my_session: {
        Args: { p_session_id: string }
        Returns: boolean
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
