-- Migration 20260712113246 revogou EXECUTE nestas 4 funções SECURITY DEFINER
-- de PUBLIC/anon/authenticated como medida de segurança ("RLS policies still
-- call them via the postgres role, which is unaffected") — mas essa
-- suposição está errada: uma policy RLS corre com o papel de quem faz a
-- query (authenticated), não como `postgres`; SECURITY DEFINER só muda com
-- que privilégios o CORPO da função lê outras tabelas, não dispensa quem a
-- CHAMA de ter EXECUTE. O re-grant a `authenticated` foi feito à mão
-- diretamente no projecto de produção (nunca como migration) e só ficou
-- documentado em schema_clean_install.sql — um projecto novo criado só a
-- partir desta pasta de migrations (`supabase db push`) fica com estas 4
-- funções inacessíveis a qualquer utilizador autenticado, partindo toda a
-- RLS de menu_items/orders/staff/tables/etc. e as policies de Storage que
-- chamam is_tenant_member() directamente (confirmado: "permission denied
-- for function is_tenant_member" ao testar contra um projecto novo).
grant execute on function public.has_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.is_superadmin(uuid) to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
