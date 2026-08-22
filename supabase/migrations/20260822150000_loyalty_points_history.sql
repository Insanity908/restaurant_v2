-- Ajustes manuais de pontos (bónus/resgate) só mudavam `customers.points_adjustment`
-- — não havia registo de quem fez o ajuste, quando, nem porquê. Histórico
-- "append-only", mesmo papel que `expense_amount_history` tem para despesas:
-- nunca é editado/apagado pela app, só lido para mostrar no perfil do cliente.
create table public.loyalty_points_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  delta integer not null,
  reason text not null,
  created_by_name text not null,
  created_at timestamptz not null default now()
);
create index idx_loyalty_points_history_lookup on public.loyalty_points_history(customer_id, created_at desc);
grant select, insert on public.loyalty_points_history to authenticated;
grant all on public.loyalty_points_history to service_role;
alter table public.loyalty_points_history enable row level security;

-- Mesmo nível de confiança que a tabela `customers` já tem (RLS por tenant,
-- gating fino de quem pode editar fica no `hasPermission('customers.edit')`
-- da app, não na base de dados).
create policy "Members access loyalty points history"
on public.loyalty_points_history for all to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));
