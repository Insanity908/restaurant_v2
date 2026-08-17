-- Pedido feito pelo próprio cliente (QR na mesa ou entrega) — esquema base.
-- As funções RPC que usam o novo valor do enum ficam numa migração
-- seguinte: o Postgres não deixa usar um valor de enum recém-criado na
-- mesma transacção em que foi adicionado.

-- Novo estado: um pedido submetido pelo cliente entra aqui e só passa a
-- 'active' (e só aí desconta stock e aparece na Cozinha) quando o Caixa
-- confirma.
alter type public.order_status add value 'awaiting-confirmation';

-- Snapshot da morada usada nesse pedido específico — não é só um FK para
-- customers.address porque a morada guardada no cliente pode mudar depois.
alter table public.orders add column delivery_address text;

-- Morada de entrega guardada/reutilizável do cliente (fidelização).
alter table public.customers add column address text;

-- Cardápio legível por qualquer visitante (sem sessão) — é o que a página
-- pública de pedido (QR/entrega) usa para montar o carrinho. Dados de
-- cardápio não são sensíveis; não há como restringir por tenant via RLS
-- aqui porque um visitante anónimo não tem sessão nenhuma — a app já
-- filtra sempre por tenant_id na query, isto só garante que não vê itens
-- indisponíveis.
create policy "Anyone reads available menu items"
on public.menu_items for select to anon
using (available = true);
