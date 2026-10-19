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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          body: string | null
          body_bn: string | null
          created_at: string
          created_by: string | null
          entity_ref: Json | null
          id: string
          is_read: boolean
          read_at: string | null
          read_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          station_id: string | null
          title: string
          title_bn: string | null
          type: string
        }
        Insert: {
          body?: string | null
          body_bn?: string | null
          created_at?: string
          created_by?: string | null
          entity_ref?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          read_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          station_id?: string | null
          title: string
          title_bn?: string | null
          type: string
        }
        Update: {
          body?: string | null
          body_bn?: string | null
          created_at?: string
          created_by?: string | null
          entity_ref?: Json | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          read_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          station_id?: string | null
          title?: string
          title_bn?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["user_role"] | null
          after: Json | null
          before: Json | null
          created_at: string
          id: number
          ip: unknown
          reason: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          ip?: unknown
          reason?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          ip?: unknown
          reason?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_no: string | null
          amount: number
          bank_name: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          from_drawer: boolean
          id: string
          reference: string | null
          shift_id: string | null
          slip_url: string | null
          source_id: string | null
          source_table: string | null
          station_id: string | null
          txn_date: string
          type: Database["public"]["Enums"]["bank_txn_type"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_no?: string | null
          amount: number
          bank_name: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_drawer?: boolean
          id?: string
          reference?: string | null
          shift_id?: string | null
          slip_url?: string | null
          source_id?: string | null
          source_table?: string | null
          station_id?: string | null
          txn_date: string
          type: Database["public"]["Enums"]["bank_txn_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_no?: string | null
          amount?: number
          bank_name?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          from_drawer?: boolean
          id?: string
          reference?: string | null
          shift_id?: string | null
          slip_url?: string | null
          source_id?: string | null
          source_table?: string | null
          station_id?: string | null
          txn_date?: string
          type?: Database["public"]["Enums"]["bank_txn_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliation: {
        Row: {
          bank_deposits: number
          cash_sales: number
          cash_variance: number
          counted_cash: number
          created_at: string
          created_by: string | null
          dues_collected: number
          expected_cash: number
          expenses_cash: number
          id: string
          opening_cash: number
          shift_id: string
          updated_at: string | null
          updated_by: string | null
          variance_reason: string | null
        }
        Insert: {
          bank_deposits?: number
          cash_sales?: number
          cash_variance?: number
          counted_cash?: number
          created_at?: string
          created_by?: string | null
          dues_collected?: number
          expected_cash?: number
          expenses_cash?: number
          id?: string
          opening_cash?: number
          shift_id: string
          updated_at?: string | null
          updated_by?: string | null
          variance_reason?: string | null
        }
        Update: {
          bank_deposits?: number
          cash_sales?: number
          cash_variance?: number
          counted_cash?: number
          created_at?: string
          created_by?: string | null
          dues_collected?: number
          expected_cash?: number
          expenses_cash?: number
          id?: string
          opening_cash?: number
          shift_id?: string
          updated_at?: string | null
          updated_by?: string | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          audio_url: string | null
          content: string
          content_lang: Database["public"]["Enums"]["language_pref"] | null
          created_at: string
          id: string
          n8n_request_id: string | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          user_id: string | null
        }
        Insert: {
          audio_url?: string | null
          content: string
          content_lang?: Database["public"]["Enums"]["language_pref"] | null
          created_at?: string
          id?: string
          n8n_request_id?: string | null
          role: Database["public"]["Enums"]["chat_role"]
          session_id: string
          user_id?: string | null
        }
        Update: {
          audio_url?: string | null
          content?: string
          content_lang?: Database["public"]["Enums"]["language_pref"] | null
          created_at?: string
          id?: string
          n8n_request_id?: string | null
          role?: Database["public"]["Enums"]["chat_role"]
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_sales: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          challan_no: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          litres: number | null
          over_limit_approved_by: string | null
          over_limit_reason: string | null
          product: Database["public"]["Enums"]["product_type"]
          rate: number | null
          shift_id: string
          slip_photo_url: string | null
          sold_at: string
          updated_at: string | null
          updated_by: string | null
          vehicle_no: string | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          litres?: number | null
          over_limit_approved_by?: string | null
          over_limit_reason?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          rate?: number | null
          shift_id: string
          slip_photo_url?: string | null
          sold_at?: string
          updated_at?: string | null
          updated_by?: string | null
          vehicle_no?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          litres?: number | null
          over_limit_approved_by?: string | null
          over_limit_reason?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          rate?: number | null
          shift_id?: string
          slip_photo_url?: string | null
          sold_at?: string
          updated_at?: string | null
          updated_by?: string | null
          vehicle_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_over_limit_approved_by_fkey"
            columns: ["over_limit_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          credit: number
          customer_id: string
          debit: number
          description: string | null
          entry_at: string
          entry_date: string
          entry_seq: number
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          running_balance: number
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id: string
          debit?: number
          description?: string | null
          entry_at?: string
          entry_date?: string
          entry_seq?: number
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          running_balance?: number
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit?: number
          customer_id?: string
          debit?: number
          description?: string | null
          entry_at?: string
          entry_date?: string
          entry_seq?: number
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          running_balance?: number
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          name_bn: string | null
          notes: string | null
          opening_balance: number
          opening_balance_as_of: string | null
          phone: string | null
          station_id: string | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string | null
          updated_by: string | null
          vehicle_numbers: string[]
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string | null
          notes?: string | null
          opening_balance?: number
          opening_balance_as_of?: string | null
          phone?: string | null
          station_id?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string | null
          updated_by?: string | null
          vehicle_numbers?: string[]
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string | null
          notes?: string | null
          opening_balance?: number
          opening_balance_as_of?: string | null
          phone?: string | null
          station_id?: string | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string | null
          updated_by?: string | null
          vehicle_numbers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispensers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          installed_at: string | null
          max_flow_lpm: number
          meter_digits: number
          nozzle_count: number
          station_id: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          tank_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installed_at?: string | null
          max_flow_lpm?: number
          meter_digits?: number
          nozzle_count?: number
          station_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          tank_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installed_at?: string | null
          max_flow_lpm?: number
          meter_digits?: number
          nozzle_count?: number
          station_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          tank_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispensers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensers_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          group: Database["public"]["Enums"]["expense_group"]
          id: string
          is_active: boolean
          name: string
          name_bn: string | null
          sort_order: number
          station_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group?: Database["public"]["Enums"]["expense_group"]
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string | null
          sort_order?: number
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group?: Database["public"]["Enums"]["expense_group"]
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string | null
          sort_order?: number
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_no: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          category_id: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          description_bn: string | null
          id: string
          paid_by: Database["public"]["Enums"]["paid_by"]
          receipt_url: string | null
          shift_id: string | null
          spent_at: string
          station_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_no?: string | null
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          description_bn?: string | null
          id?: string
          paid_by?: Database["public"]["Enums"]["paid_by"]
          receipt_url?: string | null
          shift_id?: string | null
          spent_at?: string
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_no?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          description_bn?: string | null
          id?: string
          paid_by?: Database["public"]["Enums"]["paid_by"]
          receipt_url?: string | null
          shift_id?: string | null
          spent_at?: string
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          request_hash: string | null
          response: Json | null
          route: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          key: string
          request_hash?: string | null
          response?: Json | null
          route: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          request_hash?: string | null
          response?: Json | null
          route?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lub_skus: {
        Row: {
          brand: string | null
          created_at: string
          created_by: string | null
          current_purchase_rate: number
          current_sale_rate: number
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          name_bn: string | null
          pack_size_litres: number | null
          pack_type: Database["public"]["Enums"]["pack_type"]
          reorder_level: number
          station_id: string | null
          unit: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          current_purchase_rate?: number
          current_sale_rate?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string | null
          pack_size_litres?: number | null
          pack_type: Database["public"]["Enums"]["pack_type"]
          reorder_level?: number
          station_id?: string | null
          unit?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          created_by?: string | null
          current_purchase_rate?: number
          current_sale_rate?: number
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string | null
          pack_size_litres?: number | null
          pack_type?: Database["public"]["Enums"]["pack_type"]
          reorder_level?: number
          station_id?: string | null
          unit?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lub_skus_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_skus_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_skus_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_skus_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lub_stock: {
        Row: {
          avg_cost: number
          qty_on_hand: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          avg_cost?: number
          qty_on_hand?: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          avg_cost?: number
          qty_on_hand?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lub_stock_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "lub_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      lub_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          note: string | null
          qty: number
          rate: number
          shift_id: string | null
          sku_id: string
          txn_at: string
          txn_type: Database["public"]["Enums"]["lub_txn_type"]
          updated_at: string | null
          updated_by: string | null
          vehicle_ref: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          note?: string | null
          qty: number
          rate?: number
          shift_id?: string | null
          sku_id: string
          txn_at?: string
          txn_type: Database["public"]["Enums"]["lub_txn_type"]
          updated_at?: string | null
          updated_by?: string | null
          vehicle_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          note?: string | null
          qty?: number
          rate?: number
          shift_id?: string | null
          sku_id?: string
          txn_at?: string
          txn_type?: Database["public"]["Enums"]["lub_txn_type"]
          updated_at?: string | null
          updated_by?: string | null
          vehicle_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lub_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_transactions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_transactions_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "lub_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lub_transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          ai_confidence: number | null
          ai_extracted: Json | null
          approved_at: string | null
          approved_by: string | null
          client_ref: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          credit_sale_id: string | null
          customer_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_rollover: boolean
          nozzle_id: string
          photo_url: string | null
          reading: number
          reading_type: Database["public"]["Enums"]["reading_type"]
          recorded_by: string | null
          sale_amount: number | null
          settlement: string
          shift_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_extracted?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          client_ref?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_sale_id?: string | null
          customer_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_rollover?: boolean
          nozzle_id: string
          photo_url?: string | null
          reading: number
          reading_type: Database["public"]["Enums"]["reading_type"]
          recorded_by?: string | null
          sale_amount?: number | null
          settlement?: string
          shift_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_extracted?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          client_ref?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_sale_id?: string | null
          customer_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_rollover?: boolean
          nozzle_id?: string
          photo_url?: string | null
          reading?: number
          reading_type?: Database["public"]["Enums"]["reading_type"]
          recorded_by?: string | null
          sale_amount?: number | null
          settlement?: string
          shift_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_credit_sale_id_fkey"
            columns: ["credit_sale_id"]
            isOneToOne: false
            referencedRelation: "credit_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_nozzle_id_fkey"
            columns: ["nozzle_id"]
            isOneToOne: false
            referencedRelation: "nozzles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nozzles: {
        Row: {
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dispenser_id: string
          id: string
          nozzle_no: number
          product: Database["public"]["Enums"]["product_type"]
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispenser_id: string
          id?: string
          nozzle_no: number
          product?: Database["public"]["Enums"]["product_type"]
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dispenser_id?: string
          id?: string
          nozzle_no?: number
          product?: Database["public"]["Enums"]["product_type"]
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nozzles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_dispenser_id_fkey"
            columns: ["dispenser_id"]
            isOneToOne: false
            referencedRelation: "dispensers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nozzles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_no: string | null
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          received_at: string
          received_by: string | null
          reference: string | null
          shift_id: string | null
          slip_url: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_no?: string | null
          amount: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          shift_id?: string | null
          slip_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_no?: string | null
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          shift_id?: string | null
          slip_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          full_name: string
          full_name_bn: string | null
          id: string
          is_active: boolean
          language_pref: Database["public"]["Enums"]["language_pref"]
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          station_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name: string
          full_name_bn?: string | null
          id: string
          is_active?: boolean
          language_pref?: Database["public"]["Enums"]["language_pref"]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          full_name?: string
          full_name_bn?: string | null
          id?: string
          is_active?: boolean
          language_pref?: Database["public"]["Enums"]["language_pref"]
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          litres: number
          notes: string | null
          order_date: string
          po_number: string
          rate: number
          station_id: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          litres: number
          notes?: string | null
          order_date: string
          po_number: string
          rate: number
          station_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          litres?: number
          notes?: string | null
          order_date?: string
          po_number?: string
          rate?: number
          station_id?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string
          station_id: string | null
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          station_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_sales: {
        Row: {
          cash_sales: number
          created_at: string
          created_by: string | null
          credit_sales: number
          gross_litres: number
          id: string
          lubricant_sales: number
          net_litres: number
          rate_per_litre: number
          sales_amount: number
          shift_id: string
          test_litres: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          cash_sales?: number
          created_at?: string
          created_by?: string | null
          credit_sales?: number
          gross_litres?: number
          id?: string
          lubricant_sales?: number
          net_litres?: number
          rate_per_litre: number
          sales_amount?: number
          shift_id: string
          test_litres?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          cash_sales?: number
          created_at?: string
          created_by?: string | null
          credit_sales?: number
          gross_litres?: number
          id?: string
          lubricant_sales?: number
          net_litres?: number
          rate_per_litre?: number
          sales_amount?: number
          shift_id?: string
          test_litres?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_stock: {
        Row: {
          book_closing: number
          book_opening: number
          created_at: string
          created_by: string | null
          id: string
          physical_closing: number | null
          refill_litres: number
          returned_litres: number
          shift_id: string
          sold_from_tank: number
          tank_id: string
          updated_at: string | null
          updated_by: string | null
          variance_flagged: boolean
          variance_litres: number | null
          variance_pct: number | null
          variance_reason: string | null
        }
        Insert: {
          book_closing: number
          book_opening: number
          created_at?: string
          created_by?: string | null
          id?: string
          physical_closing?: number | null
          refill_litres?: number
          returned_litres?: number
          shift_id: string
          sold_from_tank?: number
          tank_id: string
          updated_at?: string | null
          updated_by?: string | null
          variance_flagged?: boolean
          variance_litres?: number | null
          variance_pct?: number | null
          variance_reason?: string | null
        }
        Update: {
          book_closing?: number
          book_opening?: number
          created_at?: string
          created_by?: string | null
          id?: string
          physical_closing?: number | null
          refill_litres?: number
          returned_litres?: number
          shift_id?: string
          sold_from_tank?: number
          tank_id?: string
          updated_at?: string | null
          updated_by?: string | null
          variance_flagged?: boolean
          variance_litres?: number | null
          variance_pct?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_stock_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_stock_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_stock_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_stock_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_summary: {
        Row: {
          calculated_at: string
          cash_counted: number | null
          cash_expected: number | null
          cash_sales: number | null
          cash_variance: number | null
          credit_sales: number | null
          litres_sold: number | null
          lubricant_sales: number | null
          recalculated_by: string | null
          shift_id: string
          stock_variance_litres: number | null
          stock_variance_pct: number | null
          tank_book_closing: number | null
          tank_physical_closing: number | null
          tanks_flagged: number
        }
        Insert: {
          calculated_at?: string
          cash_counted?: number | null
          cash_expected?: number | null
          cash_sales?: number | null
          cash_variance?: number | null
          credit_sales?: number | null
          litres_sold?: number | null
          lubricant_sales?: number | null
          recalculated_by?: string | null
          shift_id: string
          stock_variance_litres?: number | null
          stock_variance_pct?: number | null
          tank_book_closing?: number | null
          tank_physical_closing?: number | null
          tanks_flagged?: number
        }
        Update: {
          calculated_at?: string
          cash_counted?: number | null
          cash_expected?: number | null
          cash_sales?: number | null
          cash_variance?: number | null
          credit_sales?: number | null
          litres_sold?: number | null
          lubricant_sales?: number | null
          recalculated_by?: string | null
          shift_id?: string
          stock_variance_litres?: number | null
          stock_variance_pct?: number | null
          tank_book_closing?: number | null
          tank_physical_closing?: number | null
          tanks_flagged?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_summary_recalculated_by_fkey"
            columns: ["recalculated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_summary_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          opened_by: string | null
          rate_per_litre: number | null
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          starts_at: string
          station_id: string | null
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          opened_by?: string | null
          rate_per_litre?: number | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          starts_at: string
          station_id?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          opened_by?: string | null
          rate_per_litre?: number | null
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          shift_date?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          starts_at?: string
          station_id?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          address: string
          created_at: string
          dealer_name: string
          id: string
          is_active: boolean
          name: string
          name_bn: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          address: string
          created_at?: string
          dealer_name: string
          id?: string
          is_active?: boolean
          name: string
          name_bn?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          dealer_name?: string
          id?: string
          is_active?: boolean
          name?: string
          name_bn?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sync_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_calibration: {
        Row: {
          created_at: string
          created_by: string | null
          dip_mm: number
          id: string
          litres: number
          tank_id: string
          valid_from: string
          valid_to: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dip_mm: number
          id?: string
          litres: number
          tank_id: string
          valid_from: string
          valid_to: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dip_mm?: number
          id?: string
          litres?: number
          tank_id?: string
          valid_from?: string
          valid_to?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tank_calibration_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_calibration_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_cost_history: {
        Row: {
          avg_cost: number
          created_at: string
          created_by: string | null
          depot_rate: number | null
          effective_at: string
          id: string
          note: string | null
          received_litres: number | null
          stock_before_litres: number | null
          tank_id: string
          trigger_delivery_id: string | null
        }
        Insert: {
          avg_cost: number
          created_at?: string
          created_by?: string | null
          depot_rate?: number | null
          effective_at?: string
          id?: string
          note?: string | null
          received_litres?: number | null
          stock_before_litres?: number | null
          tank_id: string
          trigger_delivery_id?: string | null
        }
        Update: {
          avg_cost?: number
          created_at?: string
          created_by?: string | null
          depot_rate?: number | null
          effective_at?: string
          id?: string
          note?: string | null
          received_litres?: number | null
          stock_before_litres?: number | null
          tank_id?: string
          trigger_delivery_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tank_cost_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_cost_history_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_cost_history_trigger_delivery_id_fkey"
            columns: ["trigger_delivery_id"]
            isOneToOne: false
            referencedRelation: "tanker_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_dips: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calibration_version: number | null
          client_ref: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          dip_mm: number
          dip_type: Database["public"]["Enums"]["dip_type"]
          id: string
          litres: number
          photo_url: string | null
          recorded_at: string
          recorded_by: string | null
          shift_id: string | null
          tank_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calibration_version?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dip_mm: number
          dip_type: Database["public"]["Enums"]["dip_type"]
          id?: string
          litres: number
          photo_url?: string | null
          recorded_at?: string
          recorded_by?: string | null
          shift_id?: string | null
          tank_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calibration_version?: number | null
          client_ref?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          dip_mm?: number
          dip_type?: Database["public"]["Enums"]["dip_type"]
          id?: string
          litres?: number
          photo_url?: string | null
          recorded_at?: string
          recorded_by?: string | null
          shift_id?: string | null
          tank_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tank_dips_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_dips_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_metadata: {
        Row: {
          calibrated_by: string | null
          calibration_date: string | null
          calibration_method: string | null
          calibration_office: string | null
          certificate_image_url: string | null
          created_at: string
          created_by: string | null
          diameter_mm: number | null
          dip_pipe_diameter_mm: number | null
          dip_pipe_length_mm: number | null
          final_dip_mm: number
          gross_height_mm: number | null
          id: string
          length_mm: number | null
          manhole_mm: number | null
          previous_calibration: string | null
          tank_id: string
          updated_at: string | null
          updated_by: string | null
          validity_from: string
          validity_to: string
        }
        Insert: {
          calibrated_by?: string | null
          calibration_date?: string | null
          calibration_method?: string | null
          calibration_office?: string | null
          certificate_image_url?: string | null
          created_at?: string
          created_by?: string | null
          diameter_mm?: number | null
          dip_pipe_diameter_mm?: number | null
          dip_pipe_length_mm?: number | null
          final_dip_mm: number
          gross_height_mm?: number | null
          id?: string
          length_mm?: number | null
          manhole_mm?: number | null
          previous_calibration?: string | null
          tank_id: string
          updated_at?: string | null
          updated_by?: string | null
          validity_from: string
          validity_to: string
        }
        Update: {
          calibrated_by?: string | null
          calibration_date?: string | null
          calibration_method?: string | null
          calibration_office?: string | null
          certificate_image_url?: string | null
          created_at?: string
          created_by?: string | null
          diameter_mm?: number | null
          dip_pipe_diameter_mm?: number | null
          dip_pipe_length_mm?: number | null
          final_dip_mm?: number
          gross_height_mm?: number | null
          id?: string
          length_mm?: number | null
          manhole_mm?: number | null
          previous_calibration?: string | null
          tank_id?: string
          updated_at?: string | null
          updated_by?: string | null
          validity_from?: string
          validity_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_metadata_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_metadata_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_metadata_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_returns: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dip_after_mm: number
          dip_before_mm: number
          id: string
          litres: number
          note: string | null
          returned_at: string
          shift_id: string | null
          tank_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dip_after_mm: number
          dip_before_mm: number
          id?: string
          litres: number
          note?: string | null
          returned_at?: string
          shift_id?: string | null
          tank_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dip_after_mm?: number
          dip_before_mm?: number
          id?: string
          litres?: number
          note?: string | null
          returned_at?: string
          shift_id?: string | null
          tank_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_returns_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_returns_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tank_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          from_dip_after_mm: number
          from_dip_before_mm: number
          from_tank_id: string
          id: string
          litres_in: number
          litres_out: number
          note: string | null
          shift_id: string | null
          to_dip_after_mm: number
          to_dip_before_mm: number
          to_tank_id: string
          transferred_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_dip_after_mm: number
          from_dip_before_mm: number
          from_tank_id: string
          id?: string
          litres_in: number
          litres_out: number
          note?: string | null
          shift_id?: string | null
          to_dip_after_mm: number
          to_dip_before_mm: number
          to_tank_id: string
          transferred_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          from_dip_after_mm?: number
          from_dip_before_mm?: number
          from_tank_id?: string
          id?: string
          litres_in?: number
          litres_out?: number
          note?: string | null
          shift_id?: string | null
          to_dip_after_mm?: number
          to_dip_before_mm?: number
          to_tank_id?: string
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tank_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_transfers_from_tank_id_fkey"
            columns: ["from_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_transfers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tank_transfers_to_tank_id_fkey"
            columns: ["to_tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
        ]
      }
      tanker_compartments: {
        Row: {
          compartment_no: number
          created_at: string
          created_by: string | null
          declared_litres: number
          delivery_id: string
          dip_after_mm: number
          dip_before_mm: number
          id: string
          litres_after: number
          litres_before: number
          received_litres: number
          shortage_flagged: boolean
          shortage_litres: number
          shortage_pct: number | null
          sold_litres: number
          tank_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          compartment_no: number
          created_at?: string
          created_by?: string | null
          declared_litres?: number
          delivery_id: string
          dip_after_mm: number
          dip_before_mm: number
          id?: string
          litres_after: number
          litres_before: number
          received_litres: number
          shortage_flagged?: boolean
          shortage_litres?: number
          shortage_pct?: number | null
          sold_litres?: number
          tank_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          compartment_no?: number
          created_at?: string
          created_by?: string | null
          declared_litres?: number
          delivery_id?: string
          dip_after_mm?: number
          dip_before_mm?: number
          id?: string
          litres_after?: number
          litres_before?: number
          received_litres?: number
          shortage_flagged?: boolean
          shortage_litres?: number
          shortage_pct?: number | null
          sold_litres?: number
          tank_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tanker_compartments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_compartments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "tanker_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_compartments_tank_id_fkey"
            columns: ["tank_id"]
            isOneToOne: false
            referencedRelation: "tanks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_compartments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tanker_deliveries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          arrived_at: string
          challan_no: string | null
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          depot_rate: number
          driver_name: string | null
          id: string
          is_opening_stock: boolean
          notes: string | null
          po_id: string | null
          purchase_value: number
          shift_id: string | null
          station_id: string | null
          total_declared: number
          total_received: number
          total_shortage: number
          truck_reg: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          depot_rate: number
          driver_name?: string | null
          id?: string
          is_opening_stock?: boolean
          notes?: string | null
          po_id?: string | null
          purchase_value?: number
          shift_id?: string | null
          station_id?: string | null
          total_declared?: number
          total_received?: number
          total_shortage?: number
          truck_reg?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          arrived_at?: string
          challan_no?: string | null
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          depot_rate?: number
          driver_name?: string | null
          id?: string
          is_opening_stock?: boolean
          notes?: string | null
          po_id?: string | null
          purchase_value?: number
          shift_id?: string | null
          station_id?: string | null
          total_declared?: number
          total_received?: number
          total_shortage?: number
          truck_reg?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tanker_deliveries_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanker_deliveries_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tanks: {
        Row: {
          capacity_litres: number
          code: string
          created_at: string
          created_by: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          installed_at: string | null
          product: Database["public"]["Enums"]["product_type"]
          station_id: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          capacity_litres: number
          code: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installed_at?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          station_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          capacity_litres?: number
          code?: string
          created_at?: string
          created_by?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          installed_at?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          station_id?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tanks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          full_name: string
          full_name_bn: string | null
          id: string
          phone: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["user_role"]
          station_id: string | null
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          full_name: string
          full_name_bn?: string | null
          id?: string
          phone?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          full_name?: string
          full_name_bn?: string | null
          id?: string
          phone?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_password: string; p_phone?: string; p_token: string }
        Returns: {
          email: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      admin_exists: {
        Args: never
        Returns: boolean
      }
      recalculate_shift: {
        Args: { p_shift_id: string }
        Returns: Json
      }
      admin_reclose_shift: {
        Args: { p_payload: Json; p_shift_id: string }
        Returns: Json
      }
      admin_set_equipment_status: {
        Args: {
          p_id: string
          p_kind: string
          p_reason: string
          p_status: Database["public"]["Enums"]["equipment_status"]
        }
        Returns: undefined
      }
      admin_upsert_calibration_row: {
        Args: {
          p_dip_mm: number
          p_litres: number
          p_reason: string
          p_tank_id: string
          p_version: number
        }
        Returns: undefined
      }
      admin_void_record: {
        Args: { p_id: string; p_reason: string; p_table: string }
        Returns: undefined
      }
      assert_md_is_read_only: {
        Args: never
        Returns: {
          command: string
          policy_name: string
          table_name: string
        }[]
      }
      business_date: { Args: { p_at?: string }; Returns: string }
      calibration_version_at: {
        Args: { p_at?: string; p_tank_id: string }
        Returns: number
      }
      can_read_money: { Args: never; Returns: boolean }
      can_write_ops: { Args: never; Returns: boolean }
      chat_customer_lookup: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          balance: number
          bucket_90_plus: number
          credit_limit: number
          customer_id: string
          is_active: boolean
          match_score: number
          name: string
          name_bn: string
          oldest_item_days: number
          vehicles: string[]
        }[]
      }
      chat_shift_status: { Args: { p_recent?: number }; Returns: Json }
      chat_tank_status: { Args: never; Returns: Json }
      check_credit_headroom: {
        Args: { p_amount?: number; p_customer_id: string }
        Returns: Json
      }
      claim_sync_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["sync_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "sync_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_shift: {
        Args: { p_payload: Json; p_shift_id: string }
        Returns: Json
      }
      compute_cash_position: {
        Args: { p_payload: Json; p_shift_id: string }
        Returns: Json
      }
      compute_shift_close: {
        Args: { p_payload: Json; p_shift_id: string }
        Returns: Json
      }
      compute_tanker_delivery: { Args: { p_payload: Json }; Returns: Json }
      create_invitation: {
        Args: {
          p_email: string
          p_full_name: string
          p_full_name_bn?: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_valid_days?: number
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      current_shift_id: { Args: never; Returns: string }
      current_shift_info: {
        Args: never
        Returns: {
          ends_at: string
          id: string
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          starts_at: string
          status: Database["public"]["Enums"]["shift_status"]
        }[]
      }
      customer_ageing: {
        Args: { p_as_of?: string }
        Returns: {
          balance: number
          bucket_0_30: number
          bucket_31_60: number
          bucket_61_90: number
          bucket_90_plus: number
          credit_limit: number
          customer_id: string
          customer_name: string
          customer_name_bn: string
          oldest_item_days: number
          opening_dated: boolean
        }[]
      }
      customer_balance: { Args: { p_customer_id: string }; Returns: number }
      daily_sheet: { Args: { p_date: string }; Returns: Json }
      dashboard_kpis: { Args: never; Returns: Json }
      dip_to_litres: {
        Args: { p_at?: string; p_dip_mm: number; p_tank_id: string }
        Returns: number
      }
      edit_tanker_delivery: {
        Args: { p_delivery_id: string; p_payload: Json }
        Returns: Json
      }
      enqueue_sync_event: {
        Args: {
          p_event_type: string
          p_idempotency_key: string
          p_payload: Json
        }
        Returns: undefined
      }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          full_name: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      is_accountant: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_dispenser: { Args: never; Returns: boolean }
      is_md: { Args: never; Returns: boolean }
      jhm_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      list_people: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          full_name_bn: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      litres_to_dip: {
        Args: { p_at?: string; p_litres: number; p_tank_id: string }
        Returns: number
      }
      mark_sync_failed: {
        Args: { p_error: string; p_id: string }
        Returns: Json
      }
      mark_sync_sent: { Args: { p_id: string }; Returns: undefined }
      moving_average_cost: {
        Args: {
          p_depot_rate: number
          p_old_cost: number
          p_old_stock: number
          p_received: number
        }
        Returns: number
      }
      post_customer_adjustment: {
        Args: { p_amount: number; p_customer_id: string; p_reason: string }
        Returns: Json
      }
      previous_counted_cash: { Args: { p_shift_id: string }; Returns: number }
      previous_shift_stock: {
        Args: { p_starts_at: string; p_tank_id: string }
        Returns: {
          book_closing: number
          book_opening: number
          created_at: string
          created_by: string | null
          id: string
          physical_closing: number | null
          refill_litres: number
          returned_litres: number
          shift_id: string
          sold_from_tank: number
          tank_id: string
          updated_at: string | null
          updated_by: string | null
          variance_flagged: boolean
          variance_litres: number | null
          variance_pct: number | null
          variance_reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shift_stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      profit_and_loss: { Args: { p_from: string; p_to: string }; Returns: Json }
      provision_account: {
        Args: {
          p_created_by?: string
          p_email: string
          p_full_name: string
          p_full_name_bn?: string
          p_password: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      purchased_oil_litres: { Args: never; Returns: number }
      recalculate_from: {
        Args: { p_shift_id: string }
        Returns: {
          out_book_closing: number
          out_book_opening: number
          out_shift_id: string
          out_tank_id: string
          out_variance_litres: number
        }[]
      }
      record_tank_cost: {
        Args: {
          p_at: string
          p_delivery_id: string
          p_rate: number
          p_received: number
          p_stock_before: number
          p_tank_id: string
        }
        Returns: undefined
      }
      record_tank_return: {
        Args: {
          p_after: number
          p_before: number
          p_note: string
          p_tank: string
        }
        Returns: Json
      }
      record_tank_transfer: {
        Args: {
          p_from: string
          p_from_after: number
          p_from_before: number
          p_note: string
          p_to: string
          p_to_after: number
          p_to_before: number
        }
        Returns: Json
      }
      record_tanker_delivery: { Args: { p_payload: Json }; Returns: Json }
      reopen_shift: {
        Args: { p_reason: string; p_shift_id: string }
        Returns: Json
      }
      revoke_invitation: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      set_audit_reason: { Args: { p_reason: string }; Returns: undefined }
      set_person_active: {
        Args: { p_active: boolean; p_id: string; p_reason: string }
        Returns: undefined
      }
      setting_numeric: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      shift_dues_collected: { Args: { p_shift_id: string }; Returns: Json }
      shift_lubricant_sales: { Args: { p_shift_id: string }; Returns: Json }
      sync_health: { Args: never; Returns: Json }
      sync_shift_closing_bank_credit: {
        Args: { p_shift_id: string }
        Returns: undefined
      }
      tank_avg_cost: {
        Args: { p_at?: string; p_tank_id: string }
        Returns: number
      }
      tank_cost_at: {
        Args: { p_at: string; p_tank_id: string }
        Returns: number
      }
      tank_final_dip_mm: {
        Args: { p_at?: string; p_tank_id: string }
        Returns: number
      }
      tank_has_cost_history: {
        Args: { p_at?: string; p_tank_id: string }
        Returns: boolean
      }
      variance_is_flagged: {
        Args: { p_variance_litres: number; p_variance_pct: number }
        Returns: boolean
      }
    }
    Enums: {
      alert_severity: "info" | "warn" | "critical"
      audit_action: "insert" | "update" | "delete"
      bank_txn_type: "deposit" | "withdrawal" | "charge"
      chat_role: "user" | "assistant"
      customer_type: "company" | "individual" | "govt"
      dip_type: "open" | "close" | "pre_refill" | "post_refill"
      equipment_status: "active" | "paused" | "removed"
      expense_group:
        | "pump"
        | "chairman"
        | "staff"
        | "maintenance"
        | "association"
        | "loan"
        | "donation"
        | "utility"
        | "other"
        | "own_use"
      invitation_status: "pending" | "accepted" | "revoked"
      language_pref: "bn" | "en"
      ledger_entry_type: "opening" | "sale" | "payment" | "adjustment"
      lub_txn_type: "purchase" | "sale" | "own_use" | "adjustment"
      pack_type: "loose" | "can" | "drum" | "grease"
      paid_by: "cash" | "bank" | "bkash" | "nagad" | "petty"
      payment_method:
        | "cash"
        | "bkash"
        | "nagad"
        | "bank"
        | "cheque"
        | "adjustment"
      po_status: "draft" | "ordered" | "in_transit" | "received" | "cancelled"
      product_type: "diesel" | "lubricant"
      reading_type: "open" | "close"
      shift_status: "open" | "closing" | "closed" | "reopened"
      shift_type: "day" | "night"
      sync_status: "pending" | "sent" | "failed"
      user_role: "dispenser" | "manager" | "admin" | "md" | "accountant"
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
      alert_severity: ["info", "warn", "critical"],
      audit_action: ["insert", "update", "delete"],
      bank_txn_type: ["deposit", "withdrawal", "charge"],
      chat_role: ["user", "assistant"],
      customer_type: ["company", "individual", "govt"],
      dip_type: ["open", "close", "pre_refill", "post_refill"],
      equipment_status: ["active", "paused", "removed"],
      expense_group: [
        "pump",
        "chairman",
        "staff",
        "maintenance",
        "association",
        "loan",
        "donation",
        "utility",
        "other",
        "own_use",
      ],
      invitation_status: ["pending", "accepted", "revoked"],
      language_pref: ["bn", "en"],
      ledger_entry_type: ["opening", "sale", "payment", "adjustment"],
      lub_txn_type: ["purchase", "sale", "own_use", "adjustment"],
      pack_type: ["loose", "can", "drum", "grease"],
      paid_by: ["cash", "bank", "bkash", "nagad", "petty"],
      payment_method: [
        "cash",
        "bkash",
        "nagad",
        "bank",
        "cheque",
        "adjustment",
      ],
      po_status: ["draft", "ordered", "in_transit", "received", "cancelled"],
      product_type: ["diesel", "lubricant"],
      reading_type: ["open", "close"],
      shift_status: ["open", "closing", "closed", "reopened"],
      shift_type: ["day", "night"],
      sync_status: ["pending", "sent", "failed"],
      user_role: ["dispenser", "manager", "admin", "md", "accountant"],
    },
  },
} as const
