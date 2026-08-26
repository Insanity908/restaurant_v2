-- A.3 (spec-push-notificacoes-permissoes.md): subscrições Web Push por
-- dispositivo — cada funcionário pode ter várias (telemóvel + desktop), por
-- isso a unicidade é por `endpoint` (identifica o dispositivo/navegador),
-- não por (tenant_id, staff_id). Reinscrever o mesmo dispositivo faz
-- upsert por `endpoint`, não duplica.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_push_subscriptions_tenant on public.push_subscriptions(tenant_id);
create index idx_push_subscriptions_staff on public.push_subscriptions(tenant_id, staff_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

-- Cada funcionário só vê/gere as suas próprias subscrições (um dispositivo).
-- A função de envio (send-push, A.6) usa o client de service role, que
-- ignora RLS, por isso não precisa de policy extra para ler subscrições de
-- outros funcionários do mesmo tenant.
create policy "staff manage own push subscription"
on public.push_subscriptions for all to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid() and public.is_tenant_member(tenant_id));
