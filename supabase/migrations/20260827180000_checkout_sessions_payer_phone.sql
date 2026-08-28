-- Secção 4.3 (docs/spec-automacao-confirmacao-pagamentos.md): terceiro
-- critério de correspondência automática — além de plano+valor, agora
-- também o número de quem pagou (payerPhone extraído da SMS), para reduzir
-- ainda mais o risco de correspondência ambígua entre tenants diferentes a
-- pagar o mesmo plano+valor ao mesmo tempo (Secção 7, risco residual já
-- documentado). Guardado como dígitos normalizados (últimos 9, sem
-- "258"/"+258" — ver normalizePhone em src/lib/checkoutSessions.ts e o
-- equivalente duplicado em supabase/functions/auto-activate-payment/
-- index.ts, Edge Function não importa de src/).
--
-- DEFAULT '' (não NULL) para não partir linhas já existentes na tabela —
-- daqui para a frente a app sempre preenche um valor real; '' nunca bate
-- com um payerPhone real extraído da SMS (sempre \d+, nunca vazio), por
-- isso não introduz nenhum falso positivo em linhas antigas.
alter table public.checkout_sessions
  add column contact_phone text not null default '';

-- Assinatura muda (novo parâmetro) — `create or replace` não troca a
-- assinatura de uma função existente, por isso a antiga é largada primeiro.
drop function if exists public.match_and_activate_checkout_session(public.billing_plan, numeric, text);

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
      and contact_phone = p_payer_phone and expires_at > v_now
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

revoke all on function public.match_and_activate_checkout_session(public.billing_plan, numeric, text, text) from public, anon, authenticated;
grant execute on function public.match_and_activate_checkout_session(public.billing_plan, numeric, text, text) to service_role;
