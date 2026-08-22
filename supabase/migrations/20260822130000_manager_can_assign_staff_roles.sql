-- StaffPage.tsx já assume que um gerente pode criar contas de
-- caixa/garçom/cozinha (`canManageStaff = hasPermission('staff.manage')`,
-- e 'manager' tem 'staff.manage' em DEFAULT_PERMISSIONS — ver
-- src/lib/permissions.ts) — mas a policy de INSERT em `user_roles`
-- capturada na migration original só permitia admin/superadmin
-- (`is_tenant_admin` ou `is_superadmin`), nunca manager. Isto foi
-- corrigido à mão directamente na restaurante-db (confirmado por RPC
-- directo: as duas funções abaixo já lá existem e respondem) e documentado
-- em schema_clean_install.sql, mas nunca capturado como migration — por
-- isso uma base de dados nova (ex.: restaurant-v2-db-tests) fica com a
-- policy antiga: um gerente vê o botão "Novo funcionário" na UI mas a
-- inserção falha silenciosamente na RLS.
--
-- Nota: a secção de Storage do schema_clean_install.sql está desactualizada
-- em relação à migration 20260810120000 (estrutura de policies diferente,
-- sem file_size_limit/allowed_mime_types) — por isso esta migration só
-- replica o que foi confirmado directamente por teste real contra a
-- restaurante-db (chamada RPC às duas funções abaixo), não o resto do
-- ficheiro.

-- Admin OU manager (superadmin sempre incluído via is_tenant_admin). Usada
-- em tabelas onde o Gerente tem acesso de gestão (menu, estoque, equipa)
-- mas Caixa/Garçom/Cozinha não têm — hoje só menu_items/inventory_items já
-- usam o equivalente inline (`is_tenant_admin(...) OR has_role(..., 'manager')`);
-- esta função existe para new código (e para bater com a produção real).
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

revoke execute on function public.is_tenant_manager_or_above(uuid) from public;
revoke execute on function public.can_assign_role(uuid, public.app_role) from public;
grant execute on function public.is_tenant_manager_or_above(uuid) to authenticated;
grant execute on function public.can_assign_role(uuid, public.app_role) to authenticated;

drop policy if exists "Only admins can manage roles" on public.user_roles;
create policy "Admins and managers can assign non-elevated roles"
on public.user_roles for insert to authenticated
with check (tenant_id is not null and public.can_assign_role(tenant_id, role));
