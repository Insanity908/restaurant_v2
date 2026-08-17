-- Planos de subscrição (valores + serviços/funcionalidades incluídas)
-- passam a ser configuráveis pelo superadmin em vez de estarem fixos no
-- código (antes: PLANS em src/lib/billing.ts). Preços não são sensíveis e
-- a página pública (Landing) mostra-os a visitantes sem sessão — por isso
-- leitura é aberta a `anon`, só o superadmin escreve.
create table public.billing_plans (
  id public.billing_plan primary key,
  label text not null,
  months int not null,
  price numeric(12,2) not null,
  savings text,
  -- Lista de serviços/funcionalidades incluídas neste plano, mostrada como
  -- checklist nas páginas de preços.
  features jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.billing_plans (id, label, months, price, savings, features) values
  ('monthly', 'Mensal', 1, 3600, null,
   '["Acesso completo", "Utilizadores ilimitados", "Suporte por email", "Atualizações incluídas"]'),
  ('quarterly', 'Trimestral', 3, 9000, 'Poupa 17%',
   '["Acesso completo", "Utilizadores ilimitados", "Suporte por email", "Atualizações incluídas"]'),
  ('semiannual', 'Semestral', 6, 16000, 'Poupa 26%',
   '["Acesso completo", "Utilizadores ilimitados", "Suporte por email", "Atualizações incluídas"]'),
  ('annual', 'Anual', 12, 30000, 'Poupa 31%',
   '["Acesso completo", "Utilizadores ilimitados", "Suporte por email", "Atualizações incluídas"]')
on conflict (id) do nothing;

grant select on public.billing_plans to anon;
grant select, insert, update, delete on public.billing_plans to authenticated;
grant all on public.billing_plans to service_role;
alter table public.billing_plans enable row level security;

create trigger trg_billing_plans_updated
before update on public.billing_plans
for each row execute function public.update_updated_at_column();

create policy "Anyone reads billing plans"
on public.billing_plans for select to anon, authenticated
using (true);

create policy "Only superadmin writes billing plans"
on public.billing_plans for all to authenticated
using (public.is_superadmin(auth.uid()))
with check (public.is_superadmin(auth.uid()));
