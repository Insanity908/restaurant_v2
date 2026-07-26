
-- =========================================================
-- FASE 0 — Schema completo para migração do POS/ERP
-- =========================================================

-- Enums
CREATE TYPE public.app_role AS ENUM ('superadmin','admin','manager','waiter','cashier','kitchen');
CREATE TYPE public.billing_plan AS ENUM ('monthly','quarterly','semiannual','annual');
CREATE TYPE public.subscription_status AS ENUM ('trial','active','expired','blocked');
CREATE TYPE public.order_type AS ENUM ('dine-in','takeaway','delivery');
CREATE TYPE public.order_status AS ENUM ('active','preparing','ready','completed','cancelled');
CREATE TYPE public.order_item_status AS ENUM ('pending','preparing','ready','served');
CREATE TYPE public.table_status AS ENUM ('free','occupied','reserved');
CREATE TYPE public.payment_method AS ENUM ('cash','card','mobile-money');

-- =========================================================
-- Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- profiles (linked to auth.users)
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- tenants
-- =========================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT,
  license_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(12),'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tenants_updated
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- tenant_members (N:N account <-> tenant)
-- =========================================================
CREATE TABLE public.tenant_members (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- user_roles (roles NEVER on profiles table)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL for superadmin
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Core authorization helpers (SECURITY DEFINER)
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (tenant_id IS NOT DISTINCT FROM _tenant_id OR (_tenant_id IS NULL AND role = 'superadmin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin')
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = _tenant_id AND user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin(auth.uid())
    OR public.has_role(auth.uid(), _tenant_id, 'admin')
$$;

-- =========================================================
-- Policies for profiles
-- =========================================================
CREATE POLICY "Users read own profile or superadmin all"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_superadmin(auth.uid()));

CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Admins can read profiles of members of tenants they manage
CREATE POLICY "Tenant admins read member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = profiles.id
      AND public.is_tenant_admin(tm.tenant_id)
  )
);

-- =========================================================
-- Policies for tenants
-- =========================================================
CREATE POLICY "Tenant members read their tenant"
ON public.tenants FOR SELECT TO authenticated
USING (public.is_tenant_member(id));

CREATE POLICY "Tenant admins update their tenant"
ON public.tenants FOR UPDATE TO authenticated
USING (public.is_tenant_admin(id)) WITH CHECK (public.is_tenant_admin(id));

CREATE POLICY "Superadmin manages tenants"
ON public.tenants FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- Anyone authenticated can create a tenant (they become admin via bootstrap edge fn)
CREATE POLICY "Authenticated may create tenants"
ON public.tenants FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- =========================================================
-- Policies for tenant_members
-- =========================================================
CREATE POLICY "See own memberships or superadmin"
ON public.tenant_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_tenant_admin(tenant_id));

CREATE POLICY "Admins manage memberships"
ON public.tenant_members FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id))
WITH CHECK (public.is_tenant_admin(tenant_id));

-- =========================================================
-- Policies for user_roles
-- =========================================================
CREATE POLICY "See own roles or admin of same tenant"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id))
);

CREATE POLICY "Only admins can manage roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id) AND role <> 'superadmin')
);

CREATE POLICY "Only admins can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.is_superadmin(auth.uid()) OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id)))
WITH CHECK (public.is_superadmin(auth.uid()) OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id) AND role <> 'superadmin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.is_superadmin(auth.uid()) OR (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id)));

-- =========================================================
-- staff_permissions
-- =========================================================
CREATE TABLE public.staff_permissions (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, staff_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read staff perms"
ON public.staff_permissions FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant admins manage staff perms"
ON public.staff_permissions FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id))
WITH CHECK (public.is_tenant_admin(tenant_id));

-- =========================================================
-- subscriptions & history
-- =========================================================
CREATE TABLE public.subscriptions (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan public.billing_plan,
  status public.subscription_status NOT NULL DEFAULT 'trial',
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_payment_ref TEXT,
  blocked_by_admin BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_subscriptions_updated
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read subscription"
ON public.subscriptions FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Superadmin manages subscription"
ON public.subscriptions FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TABLE public.subscription_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan public.billing_plan NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ref TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read sub history"
ON public.subscription_history FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Superadmin writes sub history"
ON public.subscription_history FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

-- =========================================================
-- staff (operational staff — separate from auth accounts if PIN-based)
-- =========================================================
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- optional link to Supabase account
  name TEXT NOT NULL,
  role public.app_role NOT NULL,
  pin_hash TEXT, -- bcrypt via edge function; nullable
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_tenant ON public.staff(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_staff_updated
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read staff"
ON public.staff FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Admins manage staff"
ON public.staff FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id))
WITH CHECK (public.is_tenant_admin(tenant_id));

-- =========================================================
-- menu_items
-- =========================================================
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  description TEXT,
  image_path TEXT, -- storage path
  available BOOLEAN NOT NULL DEFAULT true,
  modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipe JSONB, -- { ingredients, steps, temp }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_tenant ON public.menu_items(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_menu_items_updated
BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read menu"
ON public.menu_items FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Admins write menu"
ON public.menu_items FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'))
WITH CHECK (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'));

-- =========================================================
-- restaurant_tables (name avoids reserved word "tables")
-- =========================================================
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  number INT NOT NULL,
  seats INT NOT NULL DEFAULT 2,
  status public.table_status NOT NULL DEFAULT 'free',
  current_order_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tables_tenant ON public.restaurant_tables(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tables_updated
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members access tables"
ON public.restaurant_tables FOR ALL TO authenticated
USING (public.is_tenant_member(tenant_id))
WITH CHECK (public.is_tenant_member(tenant_id));

-- =========================================================
-- inventory_items
-- =========================================================
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'un',
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  linked_menu_item_ids UUID[] NOT NULL DEFAULT '{}',
  usage_per_serving NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_tenant ON public.inventory_items(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_inv_updated
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read inventory"
ON public.inventory_items FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Managers+ write inventory"
ON public.inventory_items FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'))
WITH CHECK (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'));

-- =========================================================
-- customers
-- =========================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  nuit TEXT,
  birthday TEXT,
  notes TEXT,
  points_adjustment INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cust_updated
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members access customers"
ON public.customers FOR ALL TO authenticated
USING (public.is_tenant_member(tenant_id))
WITH CHECK (public.is_tenant_member(tenant_id));

-- =========================================================
-- orders + items + events
-- =========================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  table_number INT,
  type public.order_type NOT NULL DEFAULT 'dine-in',
  status public.order_status NOT NULL DEFAULT 'active',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tip NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method,
  paid BOOLEAN NOT NULL DEFAULT false,
  created_by JSONB, -- {id,name,role}
  closed_by JSONB,
  cancelled_by JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX idx_orders_status ON public.orders(tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_orders_updated
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members access orders"
ON public.orders FOR ALL TO authenticated
USING (public.is_tenant_member(tenant_id))
WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  status public.order_item_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members access order items"
ON public.order_items FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_tenant_member(o.tenant_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_tenant_member(o.tenant_id)));

CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  item_id UUID,
  item_name TEXT,
  actor JSONB,
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON public.order_events(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members access order events"
ON public.order_events FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_tenant_member(o.tenant_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_tenant_member(o.tenant_id)));

-- =========================================================
-- shifts
-- =========================================================
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL,
  staff_name TEXT NOT NULL,
  staff_role public.app_role NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX idx_shifts_tenant ON public.shifts(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members access shifts"
ON public.shifts FOR ALL TO authenticated
USING (public.is_tenant_member(tenant_id))
WITH CHECK (public.is_tenant_member(tenant_id));

-- =========================================================
-- security_alerts
-- =========================================================
CREATE TABLE public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  attempted_pin TEXT,
  attempts INT NOT NULL DEFAULT 1,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_tenant ON public.security_alerts(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_alerts TO authenticated;
GRANT ALL ON public.security_alerts TO service_role;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins access alerts"
ON public.security_alerts FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'))
WITH CHECK (public.is_tenant_admin(tenant_id) OR public.has_role(auth.uid(), tenant_id, 'manager'));

-- =========================================================
-- app_settings (per tenant)
-- =========================================================
CREATE TABLE public.app_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_app_settings_updated
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Admins write app settings"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id))
WITH CHECK (public.is_tenant_admin(tenant_id));

-- =========================================================
-- loyalty_settings
-- =========================================================
CREATE TABLE public.loyalty_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  points_per_mt NUMERIC(10,4) NOT NULL DEFAULT 1,
  mt_per_point NUMERIC(10,4) NOT NULL DEFAULT 1,
  allow_discounts BOOLEAN NOT NULL DEFAULT false,
  max_discount_percent INT NOT NULL DEFAULT 0,
  tiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_settings TO authenticated;
GRANT ALL ON public.loyalty_settings TO service_role;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_loyalty_updated
BEFORE UPDATE ON public.loyalty_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members read loyalty"
ON public.loyalty_settings FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Admins write loyalty"
ON public.loyalty_settings FOR ALL TO authenticated
USING (public.is_tenant_admin(tenant_id))
WITH CHECK (public.is_tenant_admin(tenant_id));

-- =========================================================
-- system_payment_accounts (singleton global)
-- =========================================================
CREATE TABLE public.system_payment_accounts (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_account TEXT,
  bank_name TEXT,
  mobile_money TEXT,
  mobile_money_provider TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.system_payment_accounts (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_payment_accounts TO authenticated;
GRANT ALL ON public.system_payment_accounts TO service_role;
ALTER TABLE public.system_payment_accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_syspay_updated
BEFORE UPDATE ON public.system_payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Any authenticated user may READ (needed for billing page to show manual payment info)
CREATE POLICY "Everyone reads payment accounts"
ON public.system_payment_accounts FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Only superadmin writes payment accounts"
ON public.system_payment_accounts FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));
