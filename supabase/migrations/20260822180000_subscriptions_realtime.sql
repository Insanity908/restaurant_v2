-- T3.3: useLicense() passa a ouvir mudanças em `subscriptions` por Realtime
-- em vez de depender só do polling de 5 em 5 minutos — activar um plano no
-- SuperAdmin reflecte-se no dono quase de imediato. RLS já restringe SELECT
-- a `is_tenant_member`/`is_superadmin` (ver 7) em schema_clean_install.sql),
-- por isso postgres_changes normal é seguro (sem papel anon envolvido).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='subscriptions') then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end $$;
