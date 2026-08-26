-- Secção 4.3/4.4/7 (docs/spec-automacao-confirmacao-pagamentos.md):
-- correspondência SMS → sessão + activação, como uma única operação
-- atómica, chamada pela Edge Function auto-activate-payment (só
-- service_role — nunca exposta a authenticated/anon).
--
-- Porque isto tem de ser um único statement SQL (não um SELECT seguido de
-- UPDATE em dois passos a partir da Edge Function): a CTE `candidates` faz
-- `FOR UPDATE`, o que bloqueia qualquer chamada concorrente com o mesmo
-- plan+amount até esta transacção terminar — resolve exactamente a corrida
-- descrita na Secção 7 (dois pagamentos do mesmo plano processados quase
-- ao mesmo tempo). O UPDATE final só acontece quando a contagem de
-- candidatas (via `count(*) over ()`) é exactamente 1; com 0 ou mais do
-- que 1, a função devolve zero linhas — nunca activa às cegas (4.5).
--
-- Nomes das colunas devolvidas usam o prefixo `out_` de propósito: em
-- plpgsql, um parâmetro RETURNS TABLE fica disponível como variável dentro
-- da função, e nomeá-lo igual a uma coluna real (ex. `tenant_id`) fazia
-- `where tenant_id = tenant_id` comparar a variável consigo mesma em vez
-- da coluna da tabela — bug real, evitado aqui por construção.
create or replace function public.match_and_activate_checkout_session(
  p_plan public.billing_plan,
  p_amount numeric,
  p_transaction_id text
)
returns table (
  out_session_id uuid,
  out_tenant_id uuid,
  out_contact_email text,
  out_access_code text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_months int;
  v_now timestamptz := now();
  v_base timestamptz;
  v_sub public.subscriptions%rowtype;
  -- Código curto e aleatório (uuid v4 truncado — sem depender de pgcrypto)
  -- só entregue depois de confirmada a activação (Secção 2 passo 5).
  v_access_code text := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  v_session_id uuid;
  v_tenant_id uuid;
  v_contact_email text;
begin
  select months into v_months from public.billing_plans where id = p_plan;
  if v_months is null then
    raise exception 'unknown plan %', p_plan;
  end if;

  with candidates as (
    select id from public.checkout_sessions
    where status = 'pending' and plan = p_plan and amount = p_amount and expires_at > v_now
    for update
  ),
  counted as (
    select id, count(*) over () as cnt from candidates
  )
  update public.checkout_sessions cs
  set status = 'paid', paid_at = v_now, transaction_id = p_transaction_id, access_code = v_access_code
  from counted
  where cs.id = counted.id and counted.cnt = 1
  returning cs.id, cs.tenant_id, cs.contact_email into v_session_id, v_tenant_id, v_contact_email;

  if v_session_id is null then
    return; -- 0 ou >1 candidatas — sem correspondência confiante (4.5)
  end if;

  -- Activação da subscrição, espelhando action='activate' de
  -- supabase/functions/subscription-status/index.ts (mesma regra de
  -- "renovar estende a partir da expiração actual só se ainda activa").
  select * into v_sub from public.subscriptions where tenant_id = v_tenant_id for update;
  if not found then
    insert into public.subscriptions (tenant_id, plan, status, started_at, expires_at, last_payment_ref, blocked_by_admin)
    values (v_tenant_id, p_plan, 'active', v_now, v_now + make_interval(months => v_months), p_transaction_id, false);
  else
    v_base := case when v_sub.expires_at is not null and v_sub.expires_at > v_now and v_sub.status = 'active'
      then v_sub.expires_at else v_now end;
    update public.subscriptions set
      plan = p_plan,
      status = 'active',
      started_at = v_now,
      expires_at = v_base + make_interval(months => v_months),
      last_payment_ref = p_transaction_id,
      blocked_by_admin = false,
      block_reason = null
    where tenant_id = v_tenant_id;
  end if;

  insert into public.subscription_history (tenant_id, plan, paid_at, ref, price)
  values (v_tenant_id, p_plan, v_now, p_transaction_id, p_amount);

  out_session_id := v_session_id;
  out_tenant_id := v_tenant_id;
  out_contact_email := v_contact_email;
  out_access_code := v_access_code;
  return next;
end;
$$;

revoke all on function public.match_and_activate_checkout_session(public.billing_plan, numeric, text) from public, anon, authenticated;
grant execute on function public.match_and_activate_checkout_session(public.billing_plan, numeric, text) to service_role;
