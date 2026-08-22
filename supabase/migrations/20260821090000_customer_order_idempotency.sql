-- Dois bugs reportados pelo dono no fluxo de pedido do cliente (QR/entrega):
--
-- 1) submit_customer_order() não tinha nenhuma protecção contra ser chamada
--    duas vezes para o mesmo pedido lógico (duplo-toque no botão, rede
--    lenta) — cada chamada cria uma encomenda 100% nova com os seus
--    próprios order_items, e o trigger deduct_inventory_on_order_item
--    desconta o estoque a cada linha inserida, por isso um duplicado
--    desconta o estoque outra vez. Corrigido com uma chave de idempotência
--    fornecida pelo cliente (gerada uma vez por visita à página) + índice
--    único, para que uma chamada repetida devolva o pedido já criado em vez
--    de criar outro.
--
-- 2) Bebidas pedidas pelo cliente iam sempre para a Cozinha ('pending'),
--    diferente de quando um funcionário as selecciona no Menu (que já marca
--    itens da categoria "Bebidas" como 'ready' directamente — ver
--    src/pages/MenuPage.tsx). Corrigido replicando a mesma regra aqui.

alter table public.orders add column if not exists idempotency_key text;

create unique index if not exists orders_tenant_idempotency_key_idx
  on public.orders (tenant_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.submit_customer_order(uuid, uuid, text, text, jsonb, text);

create or replace function public.submit_customer_order(
  p_tenant_id uuid,
  p_table_id uuid,
  p_customer_phone text,
  p_customer_name text,
  p_items jsonb,
  p_delivery_address text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_existing_id uuid;
  v_type public.order_type;
  v_table_number int;
  v_customer_id uuid;
  v_customer_name text;
  v_delivery_address text;
  v_item jsonb;
  v_modifier jsonb;
  v_item_id uuid;
  v_item_name text;
  v_item_category text;
  v_item_price numeric;
  v_item_available boolean;
  v_item_mods jsonb;
  v_item_status public.order_item_status;
  v_qty int;
  v_line_price numeric;
  v_line_mods jsonb;
  v_mod_name text;
  v_mod_price numeric;
  v_order_total numeric := 0;
  v_plan public.billing_plan;
begin
  -- Chamada repetida com a mesma chave (duplo-toque, retry de rede): devolve
  -- o pedido já criado em vez de criar outro e descontar estoque de novo.
  if p_idempotency_key is not null then
    select id into v_existing_id from public.orders
      where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  select plan into v_plan from public.subscriptions where tenant_id = p_tenant_id;
  if v_plan is not null and v_plan::text like 'basic-%' then
    raise exception 'not available on this plan';
  end if;

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
    if p_delivery_address is null or length(trim(p_delivery_address)) = 0 then
      raise exception 'delivery address required';
    end if;
    select c.id, c.name, c.address into v_customer_id, v_customer_name, v_delivery_address
    from public.customers c
    where c.tenant_id = p_tenant_id
      and regexp_replace(c.phone, '\D', '', 'g') = regexp_replace(p_customer_phone, '\D', '', 'g')
    limit 1;
    if v_customer_id is null then
      raise exception 'customer not registered';
    end if;
    v_delivery_address := trim(p_delivery_address);
    if v_delivery_address is distinct from (select address from public.customers where id = v_customer_id) then
      update public.customers set address = v_delivery_address where id = v_customer_id;
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty order';
  end if;

  begin
    insert into public.orders (
      id, tenant_id, table_id, table_number, type, status,
      customer_id, customer_name, customer_phone, delivery_address,
      total, paid, created_by, idempotency_key
    ) values (
      v_order_id, p_tenant_id, p_table_id, v_table_number, v_type, 'awaiting-confirmation',
      v_customer_id, coalesce(v_customer_name, nullif(trim(p_customer_name), '')), p_customer_phone, v_delivery_address,
      0, false, jsonb_build_object('source', 'customer'), p_idempotency_key
    );
  exception when unique_violation then
    -- Corrida rara: duas chamadas verdadeiramente simultâneas com a mesma
    -- chave. Quem perdeu a corrida devolve o pedido que ganhou.
    select id into v_existing_id from public.orders
      where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    return v_existing_id;
  end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, name, category, price, available, modifiers
    into v_item_id, v_item_name, v_item_category, v_item_price, v_item_available, v_item_mods
    from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and tenant_id = p_tenant_id;

    if v_item_id is null or not v_item_available then
      raise exception 'invalid or unavailable item';
    end if;

    -- Bebidas não passam pela preparação da cozinha — mesma regra do Menu
    -- do funcionário (ver MenuPage.tsx: initialStatus).
    v_item_status := case when v_item_category = 'Bebidas' then 'ready' else 'pending' end;

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
    values (gen_random_uuid(), v_order_id, v_item_id, v_item_name, v_qty, v_line_price, v_line_mods, nullif(trim(v_item->>'notes'), ''), v_item_status);

    v_order_total := v_order_total + (v_line_price * v_qty);
  end loop;

  update public.orders set total = v_order_total where id = v_order_id;

  if p_table_id is not null then
    update public.restaurant_tables set status = 'occupied', current_order_id = v_order_id where id = p_table_id;
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.submit_customer_order(uuid, uuid, text, text, jsonb, text, text) to anon, authenticated;
