-- Arquivamento automático de dados por ano civil (ver edge function
-- archive-old-years). Um ano só é arquivado depois de estar bem fechado
-- (regra aplicada no código da função, não aqui): gera um .xlsx completo do
-- ano inteiro (mesmas folhas que "Arquivo de Dados" já produz manualmente
-- hoje) MAIS um .xlsx por cada mês desse ano com pedidos, guarda-os neste
-- bucket, e só DEPOIS de todos confirmados é que os dados em bruto desse
-- ano (orders/order_items/order_events/order_payments em cascata, shifts,
-- security_alerts) são apagados — nunca antes.

create table public.archived_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year int not null,
  -- 0 = resumo do ano inteiro; 1-12 = um mês específico desse ano.
  month int not null default 0 check (month between 0 and 12),
  storage_path text not null,
  -- 'archived': o Excel já está guardado com sucesso, mas os dados em bruto
  -- ainda não foram apagados (ou a função caiu a meio depois do upload).
  -- 'purged': os dados em bruto já foram apagados — este par (tenant, ano)
  -- está completo e nunca mais é reprocessado.
  status text not null default 'archived' check (status in ('archived', 'purged')),
  total_revenue numeric(12,2),
  total_orders int,
  -- Só preenchidos na linha month=0 — a eliminação é feita uma vez para o
  -- ano inteiro, não por mês.
  orders_deleted int,
  shifts_deleted int,
  alerts_deleted int,
  archived_at timestamptz not null default now(),
  purged_at timestamptz
);
create unique index archived_reports_tenant_year_month_idx on public.archived_reports(tenant_id, year, month);
grant select on public.archived_reports to authenticated;
grant all on public.archived_reports to service_role;
alter table public.archived_reports enable row level security;

create policy "Tenant admins read their archived reports"
on public.archived_reports for select to authenticated
using (public.is_tenant_admin(tenant_id));

-- Bucket privado, mesmo padrão de menu-images/receipt-logos (caminho
-- "<tenant_id>/<ano>.xlsx"). Só o service_role escreve (a função) — sem
-- policy de insert/update/delete para `authenticated`, propositadamente:
-- nem o admin do tenant deve poder substituir/apagar um arquivo já gerado
-- pela própria app.
insert into storage.buckets (id, name, public)
values ('archived-reports', 'archived-reports', false)
on conflict (id) do nothing;

create policy "archived-reports read by tenant admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'archived-reports'
  and public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

-- Descoberta de pares (tenant, ano) elegíveis para arquivamento automático —
-- usada pelo modo cron da função archive-old-years. Um ano só entra aqui
-- quando: (a) já passou pelo menos 2 viragens de ano civil desde que
-- aconteceu, e (b) já passou 1 de Abril do ano seguinte a esse limite —
-- folga extra de propósito (ver comentário na migração do agendamento) para
-- nunca apanhar ninguém a meio de fechar contas de Janeiro/Fevereiro.
-- security definer + só concedida a service_role: nunca é chamável por um
-- utilizador normal (nem precisa de o ser — só o cron/modo automático usa
-- isto; o modo manual da função indica o (tenant, ano) directamente).
create or replace function public.find_due_archive_years()
returns table (tenant_id uuid, year int)
language sql stable security definer set search_path = public
as $$
  select o.tenant_id, extract(year from o.created_at)::int as year
  from public.orders o
  left join public.archived_reports ar
    on ar.tenant_id = o.tenant_id
   and ar.year = extract(year from o.created_at)::int
   and ar.month = 0
  where ar.id is null
  group by 1, 2
  having extract(year from o.created_at)::int <= extract(year from now())::int - 2
     and now() >= make_date(extract(year from o.created_at)::int + 2, 4, 1)
  limit 20;
$$;
revoke all on function public.find_due_archive_years() from public;
grant execute on function public.find_due_archive_years() to service_role;
