-- Corrige dois problemas do lucro líquido em Relatórios (ver ReportsPage):
--
-- 1) staff_salaries e expenses só guardavam o valor ACTUAL — mudar um
--    salário hoje reescrevia silenciosamente o lucro de meses passados
--    (o relatório de Março passava a usar o salário de hoje). Agora
--    staff_salaries é um histórico "append-only" (cada "Guardar" insere
--    uma linha nova em vez de fazer update) e expenses ganha
--    expense_amount_history com o mesmo papel para despesas recorrentes —
--    Relatórios reconstrói "qual era o valor no fim deste período" em vez
--    de usar sempre o valor de hoje.
--
-- 2) "Outras despesas" não distinguia recorrente (água, energia — entra em
--    todos os períodos, proporcional aos dias) de pontual (ex.: comprar
--    uma fritadeira — devia entrar só no período em que aconteceu, não
--    todos os meses seguintes). `recurring` + `expense_date` resolvem isto.
--
-- Remover (soft-delete) uma despesa recorrente passa a arquivar
-- (archived_at) em vez de apagar a linha — apagar destruiria o histórico
-- e voltaria a estragar relatórios passados que já a incluíam.

-- -- staff_salaries: de "1 linha actual por staff" para histórico ---------
alter table public.staff_salaries drop constraint staff_salaries_pkey;
drop trigger if exists trg_staff_salaries_updated on public.staff_salaries;
alter table public.staff_salaries add column id uuid not null default gen_random_uuid();
alter table public.staff_salaries rename column updated_at to created_at;
alter table public.staff_salaries alter column created_at set default now();
alter table public.staff_salaries add primary key (id);
create index idx_staff_salaries_lookup on public.staff_salaries(tenant_id, staff_id, created_at desc);

-- -- expenses: recorrente vs pontual + arquivo em vez de apagar -----------
alter table public.expenses add column recurring boolean not null default true;
alter table public.expenses add column expense_date date;
alter table public.expenses add column archived_at timestamptz;

-- -- expense_amount_history: histórico do valor de despesas recorrentes --
create table public.expense_amount_history (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_expense_amount_history_lookup on public.expense_amount_history(expense_id, created_at desc);
grant select, insert on public.expense_amount_history to authenticated;
grant all on public.expense_amount_history to service_role;
alter table public.expense_amount_history enable row level security;

create policy "Admins manage expense amount history"
on public.expense_amount_history for all to authenticated
using (public.is_tenant_admin(tenant_id))
with check (public.is_tenant_admin(tenant_id));
