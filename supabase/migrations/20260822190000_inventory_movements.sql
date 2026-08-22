-- T3.4: histórico de movimentos de stock — hoje só o valor ACTUAL de
-- `current_stock` é visível, sem rasto de quando/porque mudou. A maioria
-- das mudanças acontece automaticamente no servidor (trigger
-- deduct_inventory_on_order_item, disparado a cada venda), por isso o
-- registo tem de viver DENTRO desse trigger, não só no cliente — só assim
-- cobre a fonte mais comum de mudança, não apenas os ajustes manuais feitos
-- na página de Inventário.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- positivo = entrada de stock, negativo = saída.
  delta numeric not null,
  reason text not null,
  -- order_id quando reason = 'Venda'; null para ajustes manuais.
  reference_id uuid,
  -- null para vendas automáticas (o trigger não tem "utilizador actual" —
  -- corre em segundo plano, disparado pelo checkout de qualquer papel).
  created_by_name text,
  created_at timestamptz not null default now()
);
create index idx_inventory_movements_lookup on public.inventory_movements(inventory_item_id, created_at desc);
grant select, insert on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;
alter table public.inventory_movements enable row level security;

-- Mesmo nível de acesso que inventory_items já tem (admin/manager, ver
-- secção 11) — quem não pode ver o stock também não deve ver o histórico.
create policy "Admins and managers access inventory movements"
on public.inventory_movements for all to authenticated
using (public.is_tenant_manager_or_above(tenant_id))
with check (public.is_tenant_manager_or_above(tenant_id));

-- Estende o trigger existente para também registar o movimento, capturando
-- o delta REAL (não a quantidade teórica) — o `greatest(0, ...)` da UPDATE
-- pode clampar a saída antes de chegar a zero, e o histórico deve reflectir
-- o que realmente aconteceu ao stock, não a fórmula.
create or replace function public.deduct_inventory_on_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if new.menu_item_id is null then
    return new;
  end if;

  select tenant_id into v_tenant_id from public.orders where id = new.order_id;
  if v_tenant_id is null then
    return new;
  end if;

  with before as (
    select id, current_stock
    from public.inventory_items
    where tenant_id = v_tenant_id
      and linked_menu_item_ids @> array[new.menu_item_id]
  ),
  updated as (
    update public.inventory_items i
    set current_stock = greatest(0, i.current_stock - i.usage_per_serving * new.quantity)
    from before b
    where i.id = b.id
    returning i.id, i.current_stock as new_stock
  )
  insert into public.inventory_movements (inventory_item_id, tenant_id, delta, reason, reference_id)
  select u.id, v_tenant_id, u.new_stock - b.current_stock, 'Venda', new.order_id
  from updated u join before b on b.id = u.id
  where u.new_stock <> b.current_stock; -- não regista "movimento" de 0 (ex.: já estava em 0)

  return new;
end;
$$;
