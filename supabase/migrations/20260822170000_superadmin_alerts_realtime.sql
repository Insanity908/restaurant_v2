-- T3.2: badge em tempo real na sidebar do superadmin (comprovativos de
-- pagamento pendentes + feedback por ler) — precisa destas duas tabelas na
-- publicação `supabase_realtime` para o cliente conseguir subscrever
-- `postgres_changes`. RLS já restringe SELECT nestas tabelas a
-- `is_superadmin(auth.uid())` (ver 18b/18c em schema_clean_install.sql),
-- por isso um `postgres_changes` normal é seguro aqui — ao contrário do
-- caso público do CustomerTrackingPage (T2.9), não há papel `anon`
-- envolvido.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payment_submissions') then
    alter publication supabase_realtime add table public.payment_submissions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='feedback_submissions') then
    alter publication supabase_realtime add table public.feedback_submissions;
  end if;
end $$;
