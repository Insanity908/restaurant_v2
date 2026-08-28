-- Alerta de silêncio para auto-activate-payment (Secção 4/7 da spec,
-- risco já identificado mas não implementado: "considerar um alerta se
-- nenhuma SMS for recebida durante um período anormalmente longo").
-- Motivado por um incidente real em 27-28/08/2026: a app de
-- reencaminhamento (MacroDroid) ficou mal configurada e nenhuma SMS
-- chegou à Edge Function durante horas, sem nenhum sinal — nem sequer uma
-- linha em checkout_match_failures, porque o pedido nunca saía do
-- telemóvel. Só foi detectado porque estava alguém a testar activamente.
--
-- `last_sms_seen_at`: actualizado pela própria auto-activate-payment em
-- TODO pedido que passe a autenticação (x-payment-webhook-secret), seja
-- qual for o resultado do parsing/correspondência — é um heartbeat de
-- "o webhook está a ser chamado", não de "os pagamentos estão a bater
-- certo" (isso já é coberto por checkout_match_failures/D5).
-- Default now() para o cron não disparar um falso alarme logo a seguir a
-- esta migração, antes de qualquer SMS real ter chegado.
alter table public.system_payment_accounts
  add column last_sms_seen_at timestamptz not null default now();

-- Reaproveita as extensões e o secret partilhado (`archive_cron_secret`
-- no Vault / `CRON_SECRET` nas variáveis de ambiente) já criados pela
-- migração 20260825201600_archive_cron_schedule.sql — é um secret
-- genérico para "quem chama é o nosso próprio pg_cron", não específico do
-- arquivamento, por isso não precisa de um novo.
select cron.schedule(
  'payment-webhook-silence-check',
  '0 */3 * * *', -- a cada 3 horas
  $$
  select net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/check-payment-webhook-silence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'archive_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
