-- Fix: notify_push_new_order e notify_push_order_ready usavam a mesma tag
-- ('order-' || id) para o MESMO pedido — a Web Push API trata duas
-- notificações com a mesma tag como uma actualização silenciosa da
-- anterior, não como um alerta novo. Confirmado por teste real: o pedido
-- de "novo pedido" chegou, o de "pedido pronto" (mesmo id) não gerou novo
-- alerta, apesar de net._http_response confirmar {"sent":1} em ambos —
-- o envio funcionou, só a apresentação no dispositivo é que colidiu.
-- Tags agora distintas por tipo de evento.
create or replace function public.notify_push_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_ids uuid[];
  v_body text;
begin
  select array_agg(staff_id) into v_staff_ids from public.staff_with_permission(new.tenant_id, 'kitchen.view');
  if v_staff_ids is null or array_length(v_staff_ids, 1) = 0 then
    return new;
  end if;

  v_body := case new.type
    when 'dine-in' then 'Mesa ' || coalesce(new.table_number::text, '?')
    when 'takeaway' then 'Para levar'
    when 'delivery' then 'Entrega'
    else 'Novo pedido'
  end;

  perform net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-trigger-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'tenantId', new.tenant_id,
      'staffIds', to_jsonb(v_staff_ids),
      'title', 'Novo pedido',
      'body', v_body,
      'url', '/kitchen',
      'tag', 'order-new-' || new.id
    )
  );
  return new;
end;
$$;

create or replace function public.notify_push_order_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_ids uuid[];
  v_body text;
begin
  if new.status <> 'ready' or old.status = 'ready' then
    return new;
  end if;

  select array_agg(staff_id) into v_staff_ids from public.staff_with_permission(new.tenant_id, 'tables.view');
  if v_staff_ids is null or array_length(v_staff_ids, 1) = 0 then
    return new;
  end if;

  v_body := case new.type
    when 'dine-in' then 'Mesa ' || coalesce(new.table_number::text, '?')
    when 'takeaway' then 'Para levar'
    when 'delivery' then 'Entrega'
    else 'Pedido pronto'
  end;

  perform net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-trigger-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'tenantId', new.tenant_id,
      'staffIds', to_jsonb(v_staff_ids),
      'title', 'Pedido pronto',
      'body', v_body,
      'url', '/pos',
      'tag', 'order-ready-' || new.id
    )
  );
  return new;
end;
$$;
