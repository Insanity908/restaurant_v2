-- Correção da migração anterior (20260908110000): PostgREST filtra por
-- `id=eq.1` em toda a query, o que exige SELECT também na coluna `id`, não só
-- nas colunas devolvidas — faltava isso no grant, e por isso `anon` estava a
-- levar 42501 mesmo só a pedir `superadmin_whatsapp`. Verificado com curl
-- real antes e depois desta correção.
grant select (id, superadmin_whatsapp, updated_at) on public.system_payment_accounts to anon;
