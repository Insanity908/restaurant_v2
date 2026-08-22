-- CustomerTrackingPage (/pedido/:orderId) é pública e não autenticada — a
-- tabela `orders` só concede select/insert/update/delete a `authenticated`,
-- por isso a página lê o estado via a RPC SECURITY DEFINER get_order_status
-- em vez de ler a tabela directamente. Um Realtime `postgres_changes`
-- normal (o padrão usado em subscribeOperations) exigiria dar a `anon` uma
-- política de SELECT em `orders`, o que exporia a tabela inteira (telefone
-- do cliente, notas, todos os pedidos do tenant) a qualquer visitante
-- anónimo com uma ligação WebSocket — não só o pedido que está a
-- acompanhar.
--
-- Em vez disso: Realtime Broadcast Authorization. Um trigger emite a
-- mudança para um tópico nomeado pelo ID do pedido ('order:<uuid>') via
-- realtime.broadcast_changes — não copia RLS nenhuma, é o próprio trigger
-- que decide o que emitir. Uma política em realtime.messages deixa
-- qualquer cliente (anon incluído) SUBSCREVER tópicos "order:*", mas só
-- recebe alguma coisa se já souber o UUID do pedido — o mesmo modelo de
-- confiança que a RPC já usa hoje (posse do UUID como capability), não uma
-- exposição nova.
--
-- realtime.broadcast_changes só tem EXECUTE concedido a `postgres`, por
-- isso os triggers têm de ser SECURITY DEFINER. E porque uma falha dentro
-- dele aborta a transacção que o disparou (ver definição da função), cada
-- trigger engole a sua própria excepção — uma falha no broadcast (efeito
-- colateral) nunca pode impedir a escrita real do pedido.

create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'order:' || coalesce(new.id, old.id)::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  exception when others then
    raise warning 'broadcast_order_change failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$$;

create trigger trg_orders_broadcast
after insert or update on public.orders
for each row execute function public.broadcast_order_change();

create or replace function public.broadcast_order_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.broadcast_changes(
      'order:' || coalesce(new.order_id, old.order_id)::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old
    );
  exception when others then
    raise warning 'broadcast_order_item_change failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$$;

create trigger trg_order_items_broadcast
after insert or update or delete on public.order_items
for each row execute function public.broadcast_order_item_change();

create policy "Anyone can receive order tracking broadcasts"
on "realtime"."messages"
for select
to anon, authenticated
using (topic like 'order:%');
