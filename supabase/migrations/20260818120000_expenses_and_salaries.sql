-- Despesas fixas (água, energia, outras) e salários da equipe — usados no
-- cálculo de lucro líquido em Relatórios. Acesso exclusivo do admin: a
-- página /expenses só é navegável por admin (ver ROUTE_PERMISSIONS no
-- frontend), reforçado aqui via RLS. staff_salaries vive numa tabela à
-- parte de `staff` de propósito — staff é legível por qualquer
-- admin/gerente (RLS é por linha, não por coluna), e salário não deve
-- ficar visível a um gerente só por ele poder ler a lista da equipa.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'other' check (category in ('water', 'energy', 'other')),
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_expenses_tenant on public.expenses(tenant_id);
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;

create trigger trg_expenses_updated
before update on public.expenses
for each row execute function public.update_updated_at_column();

create policy "Admins manage expenses"
on public.expenses for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));

create table public.staff_salaries (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  salary numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, staff_id)
);
grant select, insert, update, delete on public.staff_salaries to authenticated;
grant all on public.staff_salaries to service_role;
alter table public.staff_salaries enable row level security;

create trigger trg_staff_salaries_updated
before update on public.staff_salaries
for each row execute function public.update_updated_at_column();

create policy "Admins manage staff salaries"
on public.staff_salaries for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));
