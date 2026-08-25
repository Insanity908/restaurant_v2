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
      app_settings: {
        Row: {
          data: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_reports: {
        Row: {
          alerts_deleted: number | null
          archived_at: string
          id: string
          month: number
          orders_deleted: number | null
          purged_at: string | null
          shifts_deleted: number | null
          status: string
          storage_path: string
          tenant_id: string
          total_orders: number | null
          total_revenue: number | null
          year: number
        }
        Insert: {
          alerts_deleted?: number | null
          archived_at?: string
          id?: string
          month?: number
          orders_deleted?: number | null
          purged_at?: string | null
          shifts_deleted?: number | null
          status?: string
          storage_path: string
          tenant_id: string
          total_orders?: number | null
          total_revenue?: number | null
          year: number
        }
        Update: {
          alerts_deleted?: number | null
          archived_at?: string
          id?: string
          month?: number
          orders_deleted?: number | null
          purged_at?: string | null
          shifts_deleted?: number | null
          status?: string
          storage_path?: string
          tenant_id?: string
          total_orders?: number | null
          total_revenue?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "archived_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          features: Json
          id: Database["public"]["Enums"]["billing_plan"]
          label: string
          months: number
          price: number
          savings: string | null
          updated_at: string
        }
        Insert: {
          features?: Json
          id: Database["public"]["Enums"]["billing_plan"]
          label: string
          months: number
          price: number
          savings?: string | null
          updated_at?: string
        }
        Update: {
          features?: Json
          id?: Database["public"]["Enums"]["billing_plan"]
          label?: string
          months?: number
          price?: number
          savings?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          birthday: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          nuit: string | null
          phone: string
          points_adjustment: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          nuit?: string | null
          phone?: string
          points_adjustment?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birthday?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          nuit?: string | null
          phone?: string
          points_adjustment?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_amount_history: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expense_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_amount_history_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_amount_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          archived_at: string | null
          category: string
          created_at: string
          expense_date: string | null
          id: string
          name: string
          recurring: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          archived_at?: string | null
          category?: string
          created_at?: string
          expense_date?: string | null
          id?: string
          name: string
          recurring?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          category?: string
          created_at?: string
          expense_date?: string | null
          id?: string
          name?: string
          recurring?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          created_at: string
          id: string
          message: string
          name: string
          role: string
          status: string
          submitted_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          name: string
          role: string
          status?: string
          submitted_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          name?: string
          role?: string
          status?: string
          submitted_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          client_updated_at: string
          cost_per_unit: number
          current_stock: number
          icon: string | null
          id: string
          image: string | null
          linked_menu_item_ids: string[]
          min_stock: number
          name: string
          tenant_id: string
          unit: string
          updated_at: string
          usage_per_serving: number
        }
        Insert: {
          client_updated_at?: string
          cost_per_unit?: number
          current_stock?: number
          icon?: string | null
          id?: string
          image?: string | null
          linked_menu_item_ids?: string[]
          min_stock?: number
          name: string
          tenant_id: string
          unit?: string
          updated_at?: string
          usage_per_serving?: number
        }
        Update: {
          client_updated_at?: string
          cost_per_unit?: number
          current_stock?: number
          icon?: string | null
          id?: string
          image?: string | null
          linked_menu_item_ids?: string[]
          min_stock?: number
          name?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
          usage_per_serving?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by_name: string | null
          delta: number
          id: string
          inventory_item_id: string
          reason: string
          reference_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_name?: string | null
          delta: number
          id?: string
          inventory_item_id: string
          reason: string
          reference_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_name?: string | null
          delta?: number
          id?: string
          inventory_item_id?: string
          reason?: string
          reference_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points_history: {
        Row: {
          created_at: string
          created_by_name: string
          customer_id: string
          delta: number
          id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_name: string
          customer_id: string
          delta: number
          id?: string
          reason: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_name?: string
          customer_id?: string
          delta?: number
          id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          allow_discounts: boolean
          enabled: boolean
          max_discount_percent: number
          mt_per_point: number
          points_per_mt: number
          tenant_id: string
          tiers: Json
          updated_at: string
        }
        Insert: {
          allow_discounts?: boolean
          enabled?: boolean
          max_discount_percent?: number
          mt_per_point?: number
          points_per_mt?: number
          tenant_id: string
          tiers?: Json
          updated_at?: string
        }
        Update: {
          allow_discounts?: boolean
          enabled?: boolean
          max_discount_percent?: number
          mt_per_point?: number
          points_per_mt?: number
          tenant_id?: string
          tiers?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          category: string
          client_updated_at: string
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          modifiers: Json
          name: string
          price: number
          recipe: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          category?: string
          client_updated_at?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          modifiers?: Json
          name: string
          price?: number
          recipe?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          category?: string
          client_updated_at?: string
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          modifiers?: Json
          name?: string
          price?: number
          recipe?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: Json | null
          at: string
          id: string
          item_id: string | null
          item_name: string | null
          note: string | null
          order_id: string
          type: string
        }
        Insert: {
          actor?: Json | null
          at?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          note?: string | null
          order_id: string
          type: string
        }
        Update: {
          actor?: Json | null
          at?: string
          id?: string
          item_id?: string | null
          item_name?: string | null
          note?: string | null
          order_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string | null
          modifiers: Json
          name: string
          notes: string | null
          order_id: string
          price: number
          quantity: number
          status: Database["public"]["Enums"]["order_item_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          modifiers?: Json
          name: string
          notes?: string | null
          order_id: string
          price?: number
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          modifiers?: Json
          name?: string
          notes?: string | null
          order_id?: string
          price?: number
          quantity?: number
          status?: Database["public"]["Enums"]["order_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          closed_by: Json | null
          created_at: string
          id: string
          method: string
          order_id: string
        }
        Insert: {
          amount: number
          closed_by?: Json | null
          created_at?: string
          id?: string
          method: string
          order_id: string
        }
        Update: {
          amount?: number
          closed_by?: Json | null
          created_at?: string
          id?: string
          method?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          cancelled_by: Json | null
          client_updated_at: string
          closed_at: string | null
          closed_by: Json | null
          created_at: string
          created_by: Json | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: string | null
          discount: number
          id: string
          idempotency_key: string | null
          packaging_fee: number
          paid: boolean
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          table_number: number | null
          tenant_id: string
          tip: number
          total: number
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: Json | null
          client_updated_at?: string
          closed_at?: string | null
          closed_by?: Json | null
          created_at?: string
          created_by?: Json | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          discount?: number
          id?: string
          idempotency_key?: string | null
          packaging_fee?: number
          paid?: boolean
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_number?: number | null
          tenant_id: string
          tip?: number
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: Json | null
          client_updated_at?: string
          closed_at?: string | null
          closed_by?: Json | null
          created_at?: string
          created_by?: Json | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: string | null
          discount?: number
          id?: string
          idempotency_key?: string | null
          packaging_fee?: number
          paid?: boolean
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          table_number?: number | null
          tenant_id?: string
          tip?: number
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_submissions: {
        Row: {
          created_at: string
          id: string
          method: string
          note: string | null
          reference: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          reference: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          reference?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value?: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
        Relationships: []
      }
      preset_images: {
        Row: {
          category: string
          created_at: string
          id: string
          label: string
          storage_path: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          label: string
          storage_path: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          label?: string
          storage_path?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          client_updated_at: string
          current_order_id: string | null
          id: string
          number: number
          seats: number
          status: Database["public"]["Enums"]["table_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_updated_at?: string
          current_order_id?: string | null
          id?: string
          number: number
          seats?: number
          status?: Database["public"]["Enums"]["table_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_updated_at?: string
          current_order_id?: string | null
          id?: string
          number?: number
          seats?: number
          status?: Database["public"]["Enums"]["table_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          attempted_pin: string | null
          attempts: number
          created_at: string
          id: string
          message: string
          read: boolean
          tenant_id: string
          type: string
        }
        Insert: {
          attempted_pin?: string | null
          attempts?: number
          created_at?: string
          id?: string
          message: string
          read?: boolean
          tenant_id: string
          type: string
        }
        Update: {
          attempted_pin?: string | null
          attempts?: number
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          clock_in: string
          clock_out: string | null
          id: string
          notes: string | null
          staff_id: string
          staff_name: string
          staff_role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          id?: string
          notes?: string | null
          staff_id: string
          staff_name: string
          staff_role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          id?: string
          notes?: string | null
          staff_id?: string
          staff_name?: string
          staff_role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          id: string
          name: string
          pin: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pin?: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pin?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          permissions: string[]
          staff_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          permissions?: string[]
          staff_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          permissions?: string[]
          staff_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_salaries: {
        Row: {
          created_at: string
          id: string
          salary: number
          staff_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          salary?: number
          staff_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          salary?: number
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_salaries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_salaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          id: string
          paid_at: string
          plan: Database["public"]["Enums"]["billing_plan"]
          price: number | null
          ref: string | null
          tenant_id: string
        }
        Insert: {
          id?: string
          paid_at?: string
          plan: Database["public"]["Enums"]["billing_plan"]
          price?: number | null
          ref?: string | null
          tenant_id: string
        }
        Update: {
          id?: string
          paid_at?: string
          plan?: Database["public"]["Enums"]["billing_plan"]
          price?: number | null
          ref?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          block_reason: string | null
          blocked_by_admin: boolean
          expires_at: string | null
          last_payment_ref: string | null
          plan: Database["public"]["Enums"]["billing_plan"] | null
          started_at: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          block_reason?: string | null
          blocked_by_admin?: boolean
          expires_at?: string | null
          last_payment_ref?: string | null
          plan?: Database["public"]["Enums"]["billing_plan"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          block_reason?: string | null
          blocked_by_admin?: boolean
          expires_at?: string | null
          last_payment_ref?: string | null
          plan?: Database["public"]["Enums"]["billing_plan"] | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_payment_accounts: {
        Row: {
          bank_account: string | null
          bank_holder: string | null
          bank_name: string | null
          id: number
          mobile_money: string | null
          mobile_money_provider: string | null
          notes: string | null
          stripe_link_annual: string | null
          stripe_link_monthly: string | null
          stripe_link_quarterly: string | null
          stripe_link_semiannual: string | null
          stripe_publishable_key: string | null
          superadmin_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          id?: number
          mobile_money?: string | null
          mobile_money_provider?: string | null
          notes?: string | null
          stripe_link_annual?: string | null
          stripe_link_monthly?: string | null
          stripe_link_quarterly?: string | null
          stripe_link_semiannual?: string | null
          stripe_publishable_key?: string | null
          superadmin_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          id?: number
          mobile_money?: string | null
          mobile_money_provider?: string | null
          notes?: string | null
          stripe_link_annual?: string | null
          stripe_link_monthly?: string | null
          stripe_link_quarterly?: string | null
          stripe_link_semiannual?: string | null
          stripe_publishable_key?: string | null
          superadmin_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          joined_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          license_key: string
          name: string
          owner_email: string
          owner_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          license_key?: string
          name: string
          owner_email: string
          owner_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          license_key?: string
          name?: string
          owner_email?: string
          owner_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_assign_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
        }
        Returns: boolean
      }
      find_due_archive_years: {
        Args: never
        Returns: {
          tenant_id: string
          year: number
        }[]
      }
      get_order_status: { Args: { p_order_id: string }; Returns: Json }
      get_public_branding: { Args: { p_tenant_id: string }; Returns: Json }
      get_storage_usage: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_manager_or_above: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      is_tenant_member: { Args: { _tenant_id: string }; Returns: boolean }
      now_utc: { Args: never; Returns: string }
      resolve_login_email: { Args: { identifier: string }; Returns: string }
      resolve_login_phone: { Args: { identifier: string }; Returns: string }
      submit_customer_order: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_delivery_address?: string
          p_idempotency_key?: string
          p_items: Json
          p_table_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      verify_loyalty_customer: {
        Args: { p_phone: string; p_tenant_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "admin"
        | "manager"
        | "waiter"
        | "cashier"
        | "kitchen"
      billing_plan:
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "annual"
        | "basic-monthly"
        | "basic-quarterly"
        | "basic-semiannual"
        | "basic-annual"
      order_item_status: "pending" | "preparing" | "ready" | "served"
      order_status:
        | "active"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
        | "awaiting-confirmation"
      order_type: "dine-in" | "takeaway" | "delivery"
      payment_method: "cash" | "card" | "mobile-money"
      subscription_status: "trial" | "active" | "expired" | "blocked"
      table_status: "free" | "occupied" | "reserved"
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
    Enums: {
      app_role: [
        "superadmin",
        "admin",
        "manager",
        "waiter",
        "cashier",
        "kitchen",
      ],
      billing_plan: [
        "monthly",
        "quarterly",
        "semiannual",
        "annual",
        "basic-monthly",
        "basic-quarterly",
        "basic-semiannual",
        "basic-annual",
      ],
      order_item_status: ["pending", "preparing", "ready", "served"],
      order_status: [
        "active",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "awaiting-confirmation",
      ],
      order_type: ["dine-in", "takeaway", "delivery"],
      payment_method: ["cash", "card", "mobile-money"],
      subscription_status: ["trial", "active", "expired", "blocked"],
      table_status: ["free", "occupied", "reserved"],
    },
  },
} as const
