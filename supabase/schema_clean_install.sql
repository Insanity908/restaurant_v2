-- =============================================================================
-- SABOR POS — instalação completa e limpa (schema + RLS + fluxo de papéis)
-- =============================================================================
-- Este ficheiro NÃO é uma migração incremental — é um script único pensado
-- para correr do ZERO num projecto Supabase novo/vazio (SQL Editor, ou como
-- única migração inicial de um projecto criado de raiz).
--
-- NÃO corras isto por cima de um projecto que já tem as migrações antigas em
-- supabase/migrations/ — vais ter erros de "already exists". Para um projecto
-- NOVO: apaga o conteúdo de supabase/migrations/, corre este ficheiro (SQL
-- Editor do painel Supabase é o mais simples) e depois `supabase db pull`
-- para sincronizar o histórico de migrações local com o que lá está.
--
-- Depois de correr este script:
--   1) Actualiza o email do super-admin (ver PASSO FINAL, no fundo do ficheiro).
--   2) Cria os buckets 'menu-images' e 'receipt-logos' — já incluído aqui.
--   3) Publica as edge functions: bootstrap-tenant, subscription-status,
--      create-staff-account, import-legacy (pasta supabase/functions/).
--   4) Regista-te normalmente pela app (Signup) — o bootstrap-tenant trata de
--      criar o teu tenant + trial de 7 dias + papel admin.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1) ENUMS
-- =============================================================================
create type public.app_role as enum ('superadmin','admin','manager','waiter','cashier','kitchen');
create type public.billing_plan as enum ('monthly','quarterly','semiannual','annual');
create type public.subscription_status as enum ('trial','active','expired','blocked');
create type public.order_type as enum ('dine-in','takeaway','delivery');
create type public.order_status as enum ('active','preparing','ready','completed','cancelled');
create type public.order_item_status as enum ('pending','preparing','ready','served');
create type public.table_status as enum ('free','occupied','reserved');
create type public.payment_method as enum ('cash','card','mobile-money');

-- =============================================================================
-- 2) HELPER: updated_at automático
-- =============================================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 3) TABELAS BASE (ordem respeita as foreign keys)
-- =============================================================================

-- profiles — 1:1 com auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- username é opcional mas, quando definido, tem de ser único (case-insensitive)
create unique index idx_profiles_username_lower
  on public.profiles (lower(username))
  where username is not null and username <> '';

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- tenants — cada restaurante/unidade
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  owner_phone text,
  license_key text not null default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

create trigger trg_tenants_updated
before update on public.tenants
for each row execute function public.update_updated_at_column();

-- tenant_members — pertença conta <-> tenant (N:N)
create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index idx_tenant_members_user on public.tenant_members(user_id);
grant select, insert, update, delete on public.tenant_members to authenticated;
grant all on public.tenant_members to service_role;
alter table public.tenant_members enable row level security;

-- user_roles — papéis nunca ficam em profiles (evita escalada de privilégio)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade, -- NULL só para superadmin
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, role)
);
create index idx_user_roles_user on public.user_roles(user_id);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- =============================================================================
-- 4) FUNÇÕES DE AUTORIZAÇÃO (SECURITY DEFINER — usadas pelas policies)
-- =============================================================================

create or replace function public.has_role(_user_id uuid, _tenant_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
      and (tenant_id is not distinct from _tenant_id or (_tenant_id is null and role = 'superadmin'))
  )
$$;

create or replace function public.is_superadmin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'superadmin')
$$;

create or replace function public.is_tenant_member(_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_superadmin(auth.uid())
    or exists (
      select 1 from public.tenant_members
      where tenant_id = _tenant_id and user_id = auth.uid()
    )
$$;

create or replace function public.is_tenant_admin(_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_superadmin(auth.uid())
    or public.has_role(auth.uid(), _tenant_id, 'admin')
$$;

-- Admin OU manager (superadmin sempre incluído via is_tenant_admin). Usada em
-- todas as tabelas onde o Gerente tem acesso de gestão (menu, estoque,
-- equipa) mas Caixa/Garçom/Cozinha não têm.
create or replace function public.is_tenant_manager_or_above(_tenant_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_tenant_admin(_tenant_id)
    or public.has_role(auth.uid(), _tenant_id, 'manager')
$$;

-- Codifica exactamente a matriz de atribuição de papéis pedida:
--   • superadmin -> qualquer papel, EXCEPTO superadmin
--   • admin      -> manager/cashier/waiter/kitchen (nunca admin nem superadmin)
--   • manager    -> apenas cashier/waiter/kitchen
--   • outros     -> nada
create or replace function public.can_assign_role(_tenant_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    (public.is_superadmin(auth.uid()) and _role <> 'superadmin')
    or (public.has_role(auth.uid(), _tenant_id, 'admin') and _role <> 'superadmin' and _role <> 'admin')
    or (public.has_role(auth.uid(), _tenant_id, 'manager') and _role in ('cashier','waiter','kitchen'))
$$;

-- Resolve username OU email para o email real, para permitir login por
-- username (Supabase Auth só aceita email em signInWithPassword). SECURITY
-- DEFINER porque `profiles` não é publicamente legível — mas isto nunca
-- devolve mais do que o próprio email correspondente ao username pedido.
create or replace function public.resolve_login_email(identifier text)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when identifier ilike '%@%' then lower(trim(identifier))
    else (
      select email from public.profiles
      where lower(username) = lower(trim(identifier))
      limit 1
    )
  end;
$$;

-- =============================================================================
-- 5) POLICIES — profiles / tenants / tenant_members / user_roles
-- =============================================================================

-- profiles
create policy "Users read own profile or superadmin all"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_superadmin(auth.uid()));

create policy "Tenant admins read member profiles"
on public.profiles for select to authenticated
using (
  exists (
    select 1 from public.tenant_members tm
    where tm.user_id = profiles.id
      and public.is_tenant_admin(tm.tenant_id)
  )
);

create policy "Users update own profile"
on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- tenants
create policy "Tenant members read their tenant"
on public.tenants for select to authenticated
using (public.is_tenant_member(id));

create policy "Tenant admins update their tenant"
on public.tenants for update to authenticated
using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));

create policy "Superadmin manages tenants"
on public.tenants for all to authenticated
using (public.is_superadmin(auth.uid())) with check (public.is_superadmin(auth.uid()));

-- Criação de tenant: só o próprio dono (owner_email == email da sessão) ou
-- superadmin. Usada pelo edge function bootstrap-tenant (service role) tanto
-- no signup como em "Adicionar outra unidade".
create policy "Users create tenants they own"
on public.tenants for insert to authenticated
with check (
  public.is_superadmin(auth.uid())
  or lower(owner_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

-- tenant_members
create policy "See own memberships or admin of tenant"
on public.tenant_members for select to authenticated
using (user_id = auth.uid() or public.is_tenant_admin(tenant_id));

-- Admin OU manager podem adicionar membros (necessário para "Novo
-- funcionário" quando quem cria é um gerente); só admin edita/remove.
create policy "Admins and managers add memberships"
on public.tenant_members for insert to authenticated
with check (public.is_tenant_manager_or_above(tenant_id));

create policy "Admins update memberships"
on public.tenant_members for update to authenticated
using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));

create policy "Admins remove memberships"
on public.tenant_members for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- user_roles
create policy "See own roles or admin of same tenant"
on public.user_roles for select to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin(auth.uid())
  or (tenant_id is not null and public.is_tenant_admin(tenant_id))
);

create policy "Assign roles per matrix"
on public.user_roles for insert to authenticated
with check (tenant_id is not null and public.can_assign_role(tenant_id, role));

create policy "Update roles per matrix"
on public.user_roles for update to authenticated
using (public.is_superadmin(auth.uid()) or (tenant_id is not null and public.is_tenant_admin(tenant_id)))
with check (tenant_id is not null and public.can_assign_role(tenant_id, role));

create policy "Admins delete roles"
on public.user_roles for delete to authenticated
using (public.is_superadmin(auth.uid()) or (tenant_id is not null and public.is_tenant_admin(tenant_id)));

-- =============================================================================
-- 6) staff_permissions — overrides individuais de permissão (admin define)
-- =============================================================================
create table public.staff_permissions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  permissions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, staff_id)
);
grant select, insert, update, delete on public.staff_permissions to authenticated;
grant all on public.staff_permissions to service_role;
alter table public.staff_permissions enable row level security;

-- Leitura ampla: cada sessão precisa de saber as SUAS próprias permissões
-- efectivas ao arrancar a app, seja qual for o seu papel.
create policy "Tenant members read staff perms"
on public.staff_permissions for select to authenticated
using (public.is_tenant_member(tenant_id));

-- Só admin define/edita permissões individuais (StaffPage: canManagePerms).
create policy "Tenant admins manage staff perms"
on public.staff_permissions for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

-- =============================================================================
-- 7) subscriptions & subscription_history — controlados pelo superadmin
-- =============================================================================
create table public.subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan public.billing_plan,
  status public.subscription_status not null default 'trial',
  started_at timestamptz,
  expires_at timestamptz,
  last_payment_ref text,
  blocked_by_admin boolean not null default false,
  block_reason text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;

create trigger trg_subscriptions_updated
before update on public.subscriptions
for each row execute function public.update_updated_at_column();

create policy "Members read subscription"
on public.subscriptions for select to authenticated
using (public.is_tenant_member(tenant_id));

create policy "Superadmin manages subscription"
on public.subscriptions for all to authenticated
using (public.is_superadmin(auth.uid()))
with check (public.is_superadmin(auth.uid()));

create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan public.billing_plan not null,
  paid_at timestamptz not null default now(),
  ref text
);
grant select, insert, update, delete on public.subscription_history to authenticated;
grant all on public.subscription_history to service_role;
alter table public.subscription_history enable row level security;

create policy "Members read sub history"
on public.subscription_history for select to authenticated
using (public.is_tenant_member(tenant_id));

create policy "Superadmin writes sub history"
on public.subscription_history for all to authenticated
using (public.is_superadmin(auth.uid()))
with check (public.is_superadmin(auth.uid()));

-- =============================================================================
-- 8) staff — roster operacional (PIN para POS/turnos; login real fica em
--    tenant_members/user_roles/profiles, criado pela edge function
--    create-staff-account)
-- =============================================================================
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role public.app_role not null,
  -- Texto simples, não hash: o login por PIN foi descontinuado (ver
  -- resolve_login_email/handle_new_user) — hoje o PIN é só um identificador
  -- rápido opcional mostrado/editado por admin/manager, sem função de
  -- autenticação nenhuma. Sincronizado tal-e-qual para não se perder entre
  -- dispositivos (antes só existia em localStorage).
  pin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_staff_tenant on public.staff(tenant_id);
grant select, insert, update, delete on public.staff to authenticated;
grant all on public.staff to service_role;
alter table public.staff enable row level security;

create trigger trg_staff_updated
before update on public.staff
for each row execute function public.update_updated_at_column();

-- Só Admin/Gerente veem a lista da equipa (Equipe não está na área de
-- Caixa/Garçom/Cozinha).
create policy "Admins and managers read staff"
on public.staff for select to authenticated
using (public.is_tenant_manager_or_above(tenant_id));

-- Admin gere livremente; Gerente só pode criar/editar linhas de
-- cashier/waiter/kitchen (nunca admin/manager/superadmin).
create policy "Admins and managers write staff"
on public.staff for insert to authenticated
with check (
  public.is_tenant_admin(tenant_id)
  or (public.has_role(auth.uid(), tenant_id, 'manager') and role in ('cashier','waiter','kitchen'))
);

create policy "Admins and managers update staff"
on public.staff for update to authenticated
using (public.is_tenant_manager_or_above(tenant_id))
with check (
  public.is_tenant_admin(tenant_id)
  or (public.has_role(auth.uid(), tenant_id, 'manager') and role in ('cashier','waiter','kitchen'))
);

create policy "Admins delete staff"
on public.staff for delete to authenticated
using (public.is_tenant_admin(tenant_id));

-- =============================================================================
-- 9) menu_items
-- =============================================================================
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  category text not null default '',
  description text,
  image_path text,
  available boolean not null default true,
  modifiers jsonb not null default '[]'::jsonb,
  recipe jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_menu_items_tenant on public.menu_items(tenant_id);
grant select, insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;
alter table public.menu_items enable row level security;

create trigger trg_menu_items_updated
before update on public.menu_items
for each row execute function public.update_updated_at_column();

-- Todos os membros (incl. cozinha, para visualização) podem VER o cardápio.
create policy "Members read menu"
on public.menu_items for select to authenticated
using (public.is_tenant_member(tenant_id));

-- Só Admin/Gerente editam.
create policy "Admins and managers write menu"
on public.menu_items for all to authenticated
using (public.is_tenant_manager_or_above(tenant_id))
with check (public.is_tenant_manager_or_above(tenant_id));

-- =============================================================================
-- 10) restaurant_tables (mesas — nome evita a palavra reservada "tables")
-- =============================================================================
create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number int not null,
  seats int not null default 2,
  status public.table_status not null default 'free',
  current_order_id uuid,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tables_tenant on public.restaurant_tables(tenant_id);
grant select, insert, update, delete on public.restaurant_tables to authenticated;
grant all on public.restaurant_tables to service_role;
alter table public.restaurant_tables enable row level security;

create trigger trg_tables_updated
before update on public.restaurant_tables
for each row execute function public.update_updated_at_column();

-- Mesas são operacionais: admin/manager/cashier/waiter usam-nas activamente.
create policy "Members access tables"
on public.restaurant_tables for all to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

-- =============================================================================
-- 11) inventory_items — exclusivo de Admin/Gerente (Caixa/Garçom/Cozinha não
--     têm Estoque na sua área, nem sequer para visualizar)
-- =============================================================================
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  unit text not null default 'un',
  current_stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  cost_per_unit numeric(12,2) not null default 0,
  linked_menu_item_ids uuid[] not null default '{}',
  usage_per_serving numeric(14,3) not null default 0,
  updated_at timestamptz not null default now()
);
create index idx_inventory_tenant on public.inventory_items(tenant_id);
grant select, insert, update, delete on public.inventory_items to authenticated;
grant all on public.inventory_items to service_role;
alter table public.inventory_items enable row level security;

create trigger trg_inv_updated
before update on public.inventory_items
for each row execute function public.update_updated_at_column();

-- Uma única policy ALL: sem ela, quem não é admin/manager não vê nem
-- escreve nada nesta tabela — é exactamente o que o fluxo pede.
create policy "Admins and managers access inventory"
on public.inventory_items for all to authenticated
using (public.is_tenant_manager_or_above(tenant_id))
with check (public.is_tenant_manager_or_above(tenant_id));

-- =============================================================================
-- 12) customers
-- =============================================================================
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text,
  nuit text,
  birthday text,
  notes text,
  points_adjustment int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_tenant on public.customers(tenant_id);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;

create trigger trg_cust_updated
before update on public.customers
for each row execute function public.update_updated_at_column();

-- Clientes é usado por admin/manager/cashier/waiter no dia-a-dia do POS.
create policy "Members access customers"
on public.customers for all to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

-- =============================================================================
-- 13) orders + order_items + order_events
-- =============================================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  table_number int,
  type public.order_type not null default 'dine-in',
  status public.order_status not null default 'active',
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  total numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tip numeric(12,2) not null default 0,
  payment_method public.payment_method,
  paid boolean not null default false,
  created_by jsonb,
  closed_by jsonb,
  cancelled_by jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_at timestamptz,
  client_updated_at timestamptz not null default now()
);
create index idx_orders_tenant on public.orders(tenant_id);
create index idx_orders_status on public.orders(tenant_id, status);
create index idx_orders_client_updated_at on public.orders(client_updated_at);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;

create trigger trg_orders_updated
before update on public.orders
for each row execute function public.update_updated_at_column();

-- Todos os membros operacionais (admin/manager/cashier/waiter/kitchen)
-- precisam de ler/escrever pedidos para o POS e a Cozinha funcionarem.
-- A distinção "reports.financial" (que a Gerência não vê) é aplicada na UI/
-- exportação de relatórios, não ao nível da linha — todo o pessoal
-- operacional já vê os pedidos em bruto para poder trabalhar com eles.
create policy "Members access orders"
on public.orders for all to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  quantity int not null default 1,
  price numeric(12,2) not null default 0,
  modifiers jsonb not null default '[]'::jsonb,
  notes text,
  status public.order_item_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index idx_order_items_order on public.order_items(order_id);
grant select, insert, update, delete on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;

create policy "Members access order items"
on public.order_items for all to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)))
with check (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)));

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  type text not null,
  item_id uuid,
  item_name text,
  actor jsonb,
  note text,
  at timestamptz not null default now()
);
create index idx_order_events_order on public.order_events(order_id);
grant select, insert, update, delete on public.order_events to authenticated;
grant all on public.order_events to service_role;
alter table public.order_events enable row level security;

create policy "Members access order events"
on public.order_events for all to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)))
with check (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)));

-- Dedução automática de stock — corre no SERVIDOR, não no cliente.
--
-- inventory_items só é escrevível por admin/manager (secção 11). Um
-- checkout feito por cashier/waiter/kitchen dispara sempre a dedução de
-- stock do item vendido — mas se essa escrita fosse tentada a partir do
-- browser desses papéis, a RLS não dá erro nenhum: apenas filtra a linha e
-- a instrução UPDATE afecta 0 linhas, em silêncio. O stock parece actualizar
-- no ecrã (estado local optimista) mas nunca muda no Supabase. Um trigger
-- SECURITY DEFINER evita isto por completo: corre sempre com os privilégios
-- do dono da função, seja qual for o papel de quem criou o pedido.
create or replace function public.deduct_inventory_on_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  select tenant_id into v_tenant_id from public.orders where id = new.order_id;
  if v_tenant_id is null then
    return new;
  end if;

  update public.inventory_items
  set current_stock = greatest(0, current_stock - usage_per_serving * new.quantity)
  where tenant_id = v_tenant_id
    and linked_menu_item_ids @> array[new.menu_item_id];

  return new;
end;
$$;

create trigger trg_deduct_inventory_on_order_item
after insert on public.order_items
for each row execute function public.deduct_inventory_on_order_item();

revoke execute on function public.deduct_inventory_on_order_item() from public, anon, authenticated;

-- =============================================================================
-- 14) shifts — turnos (Todos os papéis têm "Turnos" na sua área)
-- =============================================================================
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null,
  staff_name text not null,
  staff_role public.app_role not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  notes text
);
create index idx_shifts_tenant on public.shifts(tenant_id);
grant select, insert, update, delete on public.shifts to authenticated;
grant all on public.shifts to service_role;
alter table public.shifts enable row level security;

create policy "Members access shifts"
on public.shifts for all to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

-- =============================================================================
-- 15) security_alerts — tentativas de PIN falhadas (revisão de manager/admin)
-- =============================================================================
create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  message text not null,
  attempted_pin text,
  attempts int not null default 1,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_alerts_tenant on public.security_alerts(tenant_id);
grant select, insert, update, delete on public.security_alerts to authenticated;
grant all on public.security_alerts to service_role;
alter table public.security_alerts enable row level security;

create policy "Admins and managers access alerts"
on public.security_alerts for all to authenticated
using (public.is_tenant_manager_or_above(tenant_id))
with check (public.is_tenant_manager_or_above(tenant_id));

-- =============================================================================
-- 16) app_settings — marca/tema/pagamentos por tenant (edição = só Admin)
-- =============================================================================
create table public.app_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

create trigger trg_app_settings_updated
before update on public.app_settings
for each row execute function public.update_updated_at_column();

-- Todos os membros LEEM (a sidebar mostra a marca a toda a gente).
create policy "Members read app settings"
on public.app_settings for select to authenticated
using (public.is_tenant_member(tenant_id));

-- Só admin edita — corresponde a /settings ser exclusivo do admin.
create policy "Admins write app settings"
on public.app_settings for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

-- =============================================================================
-- 17) loyalty_settings
-- =============================================================================
create table public.loyalty_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  points_per_mt numeric(10,4) not null default 1,
  mt_per_point numeric(10,4) not null default 1,
  allow_discounts boolean not null default false,
  max_discount_percent int not null default 0,
  tiers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.loyalty_settings to authenticated;
grant all on public.loyalty_settings to service_role;
alter table public.loyalty_settings enable row level security;

create trigger trg_loyalty_updated
before update on public.loyalty_settings
for each row execute function public.update_updated_at_column();

create policy "Members read loyalty"
on public.loyalty_settings for select to authenticated
using (public.is_tenant_member(tenant_id));

create policy "Admins write loyalty"
on public.loyalty_settings for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

-- =============================================================================
-- 18) system_payment_accounts — conta única global (dados manuais de
--     pagamento mostrados em /billing)
-- =============================================================================
create table public.system_payment_accounts (
  id int primary key default 1 check (id = 1),
  bank_account text,
  bank_name text,
  bank_holder text,
  notes text,
  mobile_money text,
  mobile_money_provider text,
  -- Config Stripe da plataforma (definida pelo superadmin em SuperAdmin >
  -- Faturação). A chave é "publishable" — é suposto ser pública, os Payment
  -- Links também não são secretos — por isso Admin/Gerente podem lê-los
  -- (para poder construir o checkout), só superadmin escreve.
  stripe_publishable_key text,
  stripe_link_monthly text,
  stripe_link_quarterly text,
  stripe_link_semiannual text,
  stripe_link_annual text,
  updated_at timestamptz not null default now()
);
insert into public.system_payment_accounts (id) values (1) on conflict do nothing;
grant select, insert, update, delete on public.system_payment_accounts to authenticated;
grant all on public.system_payment_accounts to service_role;
alter table public.system_payment_accounts enable row level security;

create trigger trg_syspay_updated
before update on public.system_payment_accounts
for each row execute function public.update_updated_at_column();

-- Só quem acede a /billing (admin) ou é superadmin precisa de ver isto.
create policy "Admins read payment accounts"
on public.system_payment_accounts for select to authenticated
using (
  public.is_superadmin(auth.uid())
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'::public.app_role
  )
);

create policy "Only superadmin writes payment accounts"
on public.system_payment_accounts for all to authenticated
using (public.is_superadmin(auth.uid()))
with check (public.is_superadmin(auth.uid()));

-- =============================================================================
-- 19) platform_config — guarda o email que vira superadmin automaticamente
--     no primeiro signup. Não tem policies para authenticated/anon: RLS sem
--     policies = ninguém do lado do cliente lê/escreve isto. Só a função
--     SECURITY DEFINER handle_new_user (dona = postgres) e o service role
--     conseguem aceder.
-- =============================================================================
create table public.platform_config (
  key text primary key,
  value text
);
insert into public.platform_config (key, value)
  values ('superadmin_email', 'owner@example.com')
  on conflict (key) do nothing;
alter table public.platform_config enable row level security;
grant all on public.platform_config to service_role;

-- =============================================================================
-- 20) handle_new_user — cria o profile automaticamente e promove a
--     superadmin quem se registar com o email definido em platform_config.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_email text;
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  select value into v_owner_email from public.platform_config where key = 'superadmin_email';
  if v_owner_email is not null and lower(new.email) = lower(v_owner_email) then
    insert into public.user_roles (user_id, tenant_id, role)
    values (new.id, null, 'superadmin'::public.app_role)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 21) STORAGE — buckets privados + policies (path convention: "<tenant_id>/ficheiro")
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('receipt-logos', 'receipt-logos', false)
on conflict (id) do nothing;

-- menu-images: leitura por qualquer membro; escrita por admin/manager
create policy "menu-images read by tenant members"
on storage.objects for select to authenticated
using (
  bucket_id = 'menu-images'
  and public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

create policy "menu-images write by tenant admin/manager"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'menu-images'
  and public.is_tenant_manager_or_above((storage.foldername(name))[1]::uuid)
);

create policy "menu-images update by tenant admin/manager"
on storage.objects for update to authenticated
using (
  bucket_id = 'menu-images'
  and public.is_tenant_manager_or_above((storage.foldername(name))[1]::uuid)
);

create policy "menu-images delete by tenant admin/manager"
on storage.objects for delete to authenticated
using (
  bucket_id = 'menu-images'
  and public.is_tenant_manager_or_above((storage.foldername(name))[1]::uuid)
);

-- receipt-logos: leitura por qualquer membro; escrita só por admin
create policy "receipt-logos read by tenant members"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipt-logos'
  and public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

create policy "receipt-logos write by tenant admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipt-logos'
  and public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

create policy "receipt-logos update by tenant admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'receipt-logos'
  and public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

create policy "receipt-logos delete by tenant admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipt-logos'
  and public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

-- =============================================================================
-- 22) REALTIME — POS/Mesas/Cozinha precisam de live updates
-- =============================================================================
alter table public.orders replica identity full;
alter table public.order_items replica identity full;
alter table public.restaurant_tables replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_items') then
    alter publication supabase_realtime add table public.order_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='restaurant_tables') then
    alter publication supabase_realtime add table public.restaurant_tables;
  end if;
end $$;

-- =============================================================================
-- 23) Privilégios de EXECUTE nas funções SECURITY DEFINER
-- =============================================================================
-- IMPORTANTE: has_role / is_superadmin / is_tenant_member / is_tenant_admin /
-- is_tenant_manager_or_above / can_assign_role são chamadas DENTRO das
-- próprias políticas RLS "TO authenticated" acima. Em Postgres, revogar
-- EXECUTE de `authenticated` nestas funções BLOQUEIA TODAS ESSAS POLICIES
-- para qualquer utilizador (SECURITY DEFINER só troca os privilégios usados
-- DENTRO da função — chamar a função continua a exigir EXECUTE de quem
-- pergunta). Por isso: revogamos de PUBLIC (o que já tira o acesso a `anon`)
-- e voltamos a conceder explicitamente a `authenticated`, que é quem as
-- policies realmente invocam a cada pedido.
revoke execute on function public.has_role(uuid, uuid, public.app_role) from public;
revoke execute on function public.is_superadmin(uuid) from public;
revoke execute on function public.is_tenant_member(uuid) from public;
revoke execute on function public.is_tenant_admin(uuid) from public;
revoke execute on function public.is_tenant_manager_or_above(uuid) from public;
revoke execute on function public.can_assign_role(uuid, public.app_role) from public;

grant execute on function public.has_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.is_superadmin(uuid) to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.is_tenant_manager_or_above(uuid) to authenticated;
grant execute on function public.can_assign_role(uuid, public.app_role) to authenticated;

-- Estas duas SÓ são chamadas por triggers (nunca dentro de USING/WITH
-- CHECK), e disparar um trigger não exige EXECUTE de quem faz o INSERT/
-- UPDATE — por isso podem, com segurança, ficar sem acesso directo nenhum.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;

grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- =============================================================================
-- PASSO FINAL (fazer manualmente depois de correr este script)
-- =============================================================================
-- 1. Define o email real que deve virar Super Admin automaticamente no
--    primeiro signup (troca 'owner@example.com' pelo teu email real):
--
--      update public.platform_config set value = 'owner@example.com'
--      where key = 'superadmin_email';
--
--    Depois disso, regista essa conta pela página /signup normal da app —
--    ela vai receber o papel 'superadmin' automaticamente (tenant_id NULL,
--    sem passar pelo bootstrap-tenant) e, ao entrar, é redireccionada para
--    /admin em vez de criar um restaurante.
--
-- 2. Todas as outras contas (donos de restaurante) registam-se normalmente
--    em /signup: a edge function bootstrap-tenant cria o tenant, a
--    subscrição trial de 7 dias e o papel 'admin', e semeia
--    app_settings.brandName com o nome do restaurante escrito no formulário.
-- =============================================================================
