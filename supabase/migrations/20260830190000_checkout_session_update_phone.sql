-- Secção 3/4.3 (docs/spec-automacao-confirmacao-pagamentos.md): permite ao
-- próprio membro do tenant actualizar o contact_phone de uma sessão de
-- checkout pendente já criada. Antes ficava fixo no valor da primeira vez
-- que a sessão era criada/reaproveitada (getOrCreateCheckoutSession) — se o
-- cliente fechasse o AutoPaymentDialog e reabrisse escolhendo pagar de um
-- número diferente, a sessão reaproveitada continuava com o número antigo,
-- e a correspondência automática (4.3, 3º critério: contact_phone =
-- payerPhone extraído da SMS) falhava em silêncio quando o pagamento real
-- vinha do número novo.
--
-- RPC estreita (só este campo, só sessões pending do próprio tenant) em vez
-- de abrir UPDATE geral a `authenticated` na tabela — status/access_code/
-- transaction_id/paid_at continuam exclusivos da Edge Function
-- auto-activate-payment (service role), tal como já documentado na policy
-- de INSERT em 20260826130000_checkout_sessions.sql.
create or replace function public.update_checkout_session_phone(p_session_id uuid, p_phone text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.checkout_sessions
  set contact_phone = p_phone
  where id = p_session_id
    and status = 'pending'
    and public.is_tenant_member(tenant_id);
end;
$$;

revoke all on function public.update_checkout_session_phone(uuid, text) from public, anon;
grant execute on function public.update_checkout_session_phone(uuid, text) to authenticated;
