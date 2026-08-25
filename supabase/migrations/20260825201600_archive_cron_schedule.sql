-- Agenda a corrida diária de archive-old-years via pg_cron + pg_net.
--
-- PASSO MANUAL OBRIGATÓRIO depois de aplicar esta migração (nunca corrido
-- automaticamente, e o valor nunca fica neste ficheiro nem no histórico do
-- git — só existe no Vault e nas variáveis de ambiente da função):
--
--   1) No SQL Editor do painel Supabase, gerar e guardar o secret UMA vez:
--        select vault.create_secret('<valor aleatório longo>', 'archive_cron_secret');
--   2) Definir a mesma string como variável de ambiente da função:
--        supabase secrets set CRON_SECRET=<o mesmo valor aleatório>
--
-- Sem os dois passos acima, o cron corre mas a função rejeita o pedido
-- (x-cron-secret não bate certo) — falha em segurança (não faz nada),
-- nunca em apagar dados sem autenticação.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'archive-old-years-daily',
  '0 4 * * *', -- todos os dias às 04:00 UTC
  $$
  select net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/archive-old-years',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'archive_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
