-- T4.1: dividir conta / pagamento parcial. `orders.total`/`payment_method`/
-- `paid` continuam a reflectir só o resumo final (não muda nada no resto da
-- app — relatórios, recibos, exportações continuam a ler os mesmos campos
-- de sempre). `order_payments` é só o rasto de como o total foi
-- efectivamente cobrado, em uma ou mais parcelas, cada uma com o seu
-- próprio método — mesmo padrão de `order_events` (tabela filha, RLS via
-- join a `orders`).
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null check (amount > 0),
  closed_by jsonb,
  created_at timestamptz not null default now()
);
create index idx_order_payments_order on public.order_payments(order_id);
grant select, insert, update, delete on public.order_payments to authenticated;
grant all on public.order_payments to service_role;
alter table public.order_payments enable row level security;

create policy "Members access order payments"
on public.order_payments for all to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)))
with check (exists (select 1 from public.orders o where o.id = order_id and public.is_tenant_member(o.tenant_id)));
