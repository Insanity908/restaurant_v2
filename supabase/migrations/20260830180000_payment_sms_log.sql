-- Renomeia checkout_match_failures para payment_sms_log e passa a aceitar
-- reason = 'matched' — a tabela e o separador do Super Admin deixam de
-- registar só as tentativas falhadas e passam a registar TODA a SMS de
-- pagamento processada pela activação automática (Secção 4/D5 de
-- docs/spec-automacao-confirmacao-pagamentos.md), incluindo as que
-- activaram um plano com sucesso. Motivo: ao debugar um pagamento real em
-- 30/08/2026, não havia nenhum registo unificado de "toda a SMS
-- processada" — só das que falhavam — dificultando confirmar que um
-- pagamento bem sucedido realmente tinha sido recebido pelo webhook.
alter table public.checkout_match_failures rename to payment_sms_log;
alter index idx_checkout_match_failures_created rename to idx_payment_sms_log_created;
alter table public.payment_sms_log rename constraint checkout_match_failures_reason_check to payment_sms_log_reason_check;

alter table public.payment_sms_log
  drop constraint payment_sms_log_reason_check,
  add constraint payment_sms_log_reason_check
    check (reason in ('matched', 'unparseable', 'unknown_plan', 'no_match', 'ambiguous_amount'));

alter policy "Superadmin reads checkout match failures" on public.payment_sms_log
  rename to "Superadmin reads payment sms log";
