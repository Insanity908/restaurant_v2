-- RPCs SECURITY DEFINER para o fluxo de pedido pelo cliente (sem sessão).
-- Mesmo padrão já usado em resolve_login_email/resolve_login_phone: em vez
-- de abrir `anon` a INSERT/SELECT directos em orders/order_items/customers
-- (o que obrigaria a RLS complexas e arriscadas para dar a um visitante
-- anónimo acesso apenas ao "seu" pedido), expomos só estas três operações
-- estreitas, cada uma validando tudo o que precisa no servidor.

-- Qualquer membro do tenant faz pedidos por QR/entrega — usada antes de
-- montar o carrinho para confirmar que o telefone já está na fidelização
-- e pré-preencher a morada guardada.
create or replace function public.verify_loyalty_customer(p_tenant_id uuid, p_phone text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'address', c.address)
  from public.customers c
  where c.tenant_id = p_tenant_id
    and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  limit 1;
$$;

-- Submete o pedido do cliente. Nunca confia em preços/nomes vindos do
-- browser — relê tudo de menu_items no servidor. p_items:
-- [{"menu_item_id": uuid, "quantity": int, "modifiers": [{"id": uuid}], "notes": text}]
create or replace function public.submit_customer_order(
  p_tenant_id uuid,
  p_table_id uuid,
  p_customer_phone text,
  p_customer_name text,
  p_items jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_type public.order_type;
  v_table_number int;
  v_customer_id uuid;
  v_customer_name text;
  v_delivery_address text;
  v_item jsonb;
  v_modifier jsonb;
  v_item_id uuid;
  v_item_name text;
  v_item_price numeric;
  v_item_available boolean;
  v_item_mods jsonb;
  v_qty int;
  v_line_price numeric;
  v_line_mods jsonb;
  v_mod_name text;
  v_mod_price numeric;
  v_order_total numeric := 0;
begin
  if p_table_id is not null then
    v_type := 'dine-in';
    select number into v_table_number from public.restaurant_tables
    where id = p_table_id and tenant_id = p_tenant_id;
    if v_table_number is null then
      raise exception 'invalid table';
    end if;
  else
    v_type := 'delivery';
    if p_customer_phone is null or length(trim(p_customer_phone)) = 0 then
      raise exception 'phone required for delivery';
    end if;
    select c.id, c.name, c.address into v_customer_id, v_customer_name, v_delivery_address
    from public.customers c
    where c.tenant_id = p_tenant_id
      and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_customer_phone, '\D', '', 'g')
    limit 1;
    if v_customer_id is null then
      raise exception 'customer not registered';
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  insert into public.orders (
    id, tenant_id, table_id, table_number, type, status,
    customer_id, customer_name, customer_phone, delivery_address,
    total, paid, created_by
  ) values (
    v_order_id, p_tenant_id, p_table_id, v_table_number, v_type, 'awaiting-confirmation',
    v_customer_id, coalesce(v_customer_name, nullif(trim(p_customer_name), '')), p_customer_phone, v_delivery_address,
    0, false, jsonb_build_object('source', 'customer')
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, price, available, modifiers
    into v_item_id, v_item_name, v_item_price, v_item_available, v_item_mods
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and tenant_id = p_tenant_id;

    if v_item_id is null or not v_item_available then
      raise exception 'invalid or unavailable item';
    end if;

    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));
    v_line_price := v_item_price;
    v_line_mods := '[]'::jsonb;

    for v_modifier in select * from jsonb_array_elements(coalesce(v_item->'modifiers', '[]'::jsonb))
    loop
      select m->>'name', (m->>'price')::numeric into v_mod_name, v_mod_price
      from jsonb_array_elements(coalesce(v_item_mods, '[]'::jsonb)) m
      where m->>'id' = v_modifier->>'id';

      if v_mod_name is not null then
        v_line_price := v_line_price + coalesce(v_mod_price, 0);
        v_line_mods := v_line_mods || jsonb_build_object('id', v_modifier->>'id', 'name', v_mod_name, 'price', coalesce(v_mod_price, 0));
      end if;
    end loop;

    insert into public.order_items (id, order_id, menu_item_id, name, quantity, price, modifiers, notes, status)
    values (gen_random_uuid(), v_order_id, v_item_id, v_item_name, v_qty, v_line_price, v_line_mods, nullif(trim(v_item->>'notes'), ''), 'pending');

    v_order_total := v_order_total + (v_line_price * v_qty);
  end loop;

  update public.orders set total = v_order_total where id = v_order_id;

  if p_table_id is not null then
    update public.restaurant_tables set status = 'occupied', current_order_id = v_order_id where id = p_table_id;
  end if;

  return v_order_id;
end;
$$;

-- Acompanhamento pelo cliente — devolve só o essencial (nunca a lista
-- completa de pedidos do tenant), chamado por polling na página pública.
create or replace function public.get_order_status(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'type', o.type,
    'tableNumber', o.table_number,
    'total', o.total,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', oi.name, 'quantity', oi.quantity, 'status', oi.status
      ) order by oi.id)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

grant execute on function public.verify_loyalty_customer(uuid, text) to anon, authenticated;
grant execute on function public.submit_customer_order(uuid, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.get_order_status(uuid) to anon, authenticated;
