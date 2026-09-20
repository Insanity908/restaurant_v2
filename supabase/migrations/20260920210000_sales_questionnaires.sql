-- Ficha de Visita e Diagnóstico (JSETRA) enviada pelo superadmin a um
-- indivíduo/restaurante fora da plataforma, para preencherem sozinhos sem
-- precisar de conta — mesmo padrão de submit_customer_order/
-- get_order_status: a tabela não tem grants directos a `anon`, só duas RPCs
-- security definer guardadas por um token opaco (o link enviado).
create table public.sales_questionnaires (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references auth.users(id),
  -- Nome do estabelecimento/pessoa a quem foi enviado — só para o
  -- superadmin identificar na lista, nunca mostrado a quem preenche.
  label text not null,
  status text not null default 'pending' check (status in ('pending', 'submitted')),
  answers jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
grant select, insert, update, delete on public.sales_questionnaires to authenticated;
grant all on public.sales_questionnaires to service_role;
alter table public.sales_questionnaires enable row level security;

create policy "Superadmin manages sales questionnaires"
on public.sales_questionnaires for all to authenticated
using (public.is_superadmin(auth.uid()))
with check (public.is_superadmin(auth.uid()));

-- Público (link com token) — só o suficiente para carregar o estado actual
-- e submeter respostas; nunca lista nem identifica outros questionários.
create or replace function public.get_questionnaire_by_token(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'status', q.status,
    'answers', q.answers
  )
  from public.sales_questionnaires q
  where q.token = p_token;
$$;

create or replace function public.submit_questionnaire_response(p_token uuid, p_answers jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.sales_questionnaires
  set answers = p_answers, status = 'submitted', submitted_at = now()
  where token = p_token;
  return found;
end;
$$;

grant execute on function public.get_questionnaire_by_token(uuid) to anon, authenticated;
grant execute on function public.submit_questionnaire_response(uuid, jsonb) to anon, authenticated;
