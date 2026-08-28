-- Secção 4 (docs/spec-automacao-confirmacao-pagamentos.md): três ajustes
-- relacionados, motivados por descobertas reais durante a implementação:
--
-- 1. M-Pesa não aceita um campo de referência livre ("Conteudo") como o
--    e-Mola — por isso o M-Pesa vai ter de identificar o plano só pelo
--    valor (reverse lookup contra billing_plans, feito na Edge Function),
--    nunca por conteúdo. checkout_match_failures precisa de um motivo novo
--    para quando esse valor não é único (colide entre planos), distinto de
--    'unknown_plan' (nenhum plano bate) — nunca activar às cegas (4.5).
--
-- 2. Numa transferência entre operadoras diferentes (ex. cliente paga de
--    e-Mola para o número M-Pesa do superadmin, ou vice-versa), a SMS pode
--    não trazer o número de quem pagou. O critério de telefone acrescentado
--    na migração anterior (20260827180000) exigia sempre bater certo — sem
--    isto, esses pagamentos legítimos nunca activavam automaticamente.
--    Correcção: quando a Edge Function não conseguir extrair um telefone
--    (passa '' em vez de omitir), o critério de telefone é ignorado nessa
--    correspondência, voltando ao comportamento anterior (só plano+valor)
--    só para esse caso — nunca o oposto (nunca ignora plano ou valor).
--
-- 3. system_payment_accounts passa a guardar dois números separados (um
--    por operadora) — Secção 1: o cliente escolhe no ecrã de pagamento qual
--    operadora vai usar, e a app mostra o número certo dessa operadora, em
--    vez de um único "número de conta móvel" genérico (esse continua a
--    existir, ainda usado no fluxo manual/WhatsApp de BillingPage/
--    BlockedPage — não relacionado com a activação automática).
alter table public.system_payment_accounts
  add column emola_number text,
  add column mpesa_number text;

alter table public.checkout_match_failures
  drop constraint checkout_match_failures_reason_check,
  add constraint checkout_match_failures_reason_check
    check (reason in ('unparseable', 'unknown_plan', 'no_match', 'ambiguous_amount'));

-- Mesma assinatura da migração anterior — só o corpo muda (`create or
-- replace` chega, sem precisar de drop).
create or replace function public.match_and_activate_checkout_session(
  p_plan public.billing_plan,
  p_amount numeric,
  p_transaction_id text,
  p_payer_phone text
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
    where status = 'pending' and plan = p_plan and amount = p_amount
      -- '' significa "a SMS não trouxe o telefone de quem pagou" (ex.
      -- transferência cross-operadora) — nesse caso o critério de telefone
      -- é ignorado, nunca o de plano ou valor.
      and (p_payer_phone = '' or contact_phone = p_payer_phone)
      and expires_at > v_now
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
