-- Secção 4.5/D5 (docs/spec-automacao-confirmacao-pagamentos.md): registo de
-- toda a tentativa de correspondência SMS → sessão que falhou (texto não
-- reconhecido, plano desconhecido, ou 0/>1 sessões pendentes candidatas),
-- para revisão manual — a automação nunca activa às cegas, mas também
-- nunca falha silenciosamente. Só a Edge Function auto-activate-payment
-- (service role) escreve; só o superadmin lê.
create table public.checkout_match_failures (
  id uuid primary key default gen_random_uuid(),
  reason text not null check (reason in ('unparseable', 'unknown_plan', 'no_match')),
  raw_text text not null,
  -- Campos que foi possível extrair antes de falhar (nulo se `reason` =
  -- 'unparseable', já que nesse caso nada foi extraído).
  extracted jsonb,
  created_at timestamptz not null default now()
);
create index idx_checkout_match_failures_created on public.checkout_match_failures (created_at desc);

grant select on public.checkout_match_failures to authenticated;
grant all on public.checkout_match_failures to service_role;
alter table public.checkout_match_failures enable row level security;

create policy "Superadmin reads checkout match failures"
on public.checkout_match_failures for select to authenticated
using (public.is_superadmin(auth.uid()));
