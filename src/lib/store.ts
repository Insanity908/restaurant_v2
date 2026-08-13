import { MenuItem, Table, Order, OrderItem, OrderEvent, Staff, InventoryItem, Shift, SecurityAlert, Customer } from '@/types/restaurant';
import { supabase } from '@/integrations/supabase/client';
import { cloud, pendingResourceIds } from './outbox';
import { warmStorageUrls, MENU_BUCKET } from './storage';
import { tenantScopedKey } from './localCache';

// Tenant-scoped keys: automatically prefixed with the active tenant id so that
// each restaurant has its own isolated data in localStorage.
const TENANT_SCOPED = new Set([
  'menu_items', 'tables', 'orders', 'inventory', 'customers',
  'staff', 'security_alerts', 'shifts',
]);

function scopedKey(key: string): string {
  if (!TENANT_SCOPED.has(key)) return key;
  return tenantScopedKey(key);
}

function getStore<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(scopedKey(key));
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setStore<T>(key: string, data: T[]): void {
  localStorage.setItem(scopedKey(key), JSON.stringify(data));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(id: string): boolean { return UUID_RE.test(id); }

function generateId(): string {
  // Prefer real UUIDs so records can be mirrored to Supabase.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function tenantId(): string | null { return localStorage.getItem('current_tenant_id'); }
function warn(op: string, err: { message: string } | null) { if (err) console.warn(`[cloud-sync] ${op} failed: ${err.message}`); }

/**
 * Reconciliação: registos com escritas ainda por sincronizar mantêm a versão
 * local (o dispositivo é a fonte de verdade até a fila ser esvaziada); tudo o
 * resto é substituído pelos dados do servidor.
 */
function mergePending<T extends { id: string }>(serverRows: T[], localRows: T[], table: string | string[]): T[] {
  const pending = pendingResourceIds(table);
  if (!pending.size) return serverRows;
  const localById = new Map(localRows.map(r => [r.id, r]));
  const merged = serverRows.map(r => (pending.has(r.id) && localById.has(r.id) ? (localById.get(r.id) as T) : r));
  const serverIds = new Set(serverRows.map(r => r.id));
  localRows.forEach(r => { if (pending.has(r.id) && !serverIds.has(r.id)) merged.push(r); });
  return merged;
}



// -- Menu Items --------------------------------------------------------------
export const menuStore = {
  getAll: (): MenuItem[] => getStore<MenuItem>('menu_items'),
  save: (items: MenuItem[]) => setStore('menu_items', items),
  add: (item: Omit<MenuItem, 'id'>): MenuItem => {
    const items = menuStore.getAll();
    const newItem = { ...item, id: generateId() };
    items.push(newItem);
    menuStore.save(items);
    const t = tenantId();
    if (t && isUuid(newItem.id)) {
      void cloud('menu_items').insert({
        id: newItem.id, tenant_id: t, name: newItem.name, price: newItem.price, category: newItem.category,
        description: newItem.description ?? null, image_path: newItem.image ?? null, available: newItem.available,
        modifiers: (newItem.modifiers ?? []) as never, recipe: (newItem.recipe ?? null) as never,
      }).then(({ error }) => warn('menu.insert', error));
    }
    return newItem;
  },
  update: (id: string, updates: Partial<MenuItem>) => {
    const items = menuStore.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; menuStore.save(items); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.price !== undefined) row.price = updates.price;
      if (updates.category !== undefined) row.category = updates.category;
      if (updates.description !== undefined) row.description = updates.description ?? null;
      if (updates.image !== undefined) row.image_path = updates.image ?? null;
      if (updates.available !== undefined) row.available = updates.available;
      if (updates.modifiers !== undefined) row.modifiers = updates.modifiers ?? [];
      if (updates.recipe !== undefined) row.recipe = updates.recipe ?? null;
      if (Object.keys(row).length) {
        void cloud('menu_items').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('menu.update', error));
      }
    }
    return items[idx];
  },
  remove: (id: string) => {
    menuStore.save(menuStore.getAll().filter(i => i.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('menu_items').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('menu.delete', error));
    }
  },
};

export async function fetchMenu(t: string): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('menu_items').select('*').eq('tenant_id', t);
  if (error) { warn('menu.fetch', error); return menuStore.getAll(); }
  const rows: MenuItem[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, price: Number(r.price), category: r.category,
    description: r.description ?? undefined, image: r.image_path ?? undefined,
    available: r.available, modifiers: (r.modifiers ?? []) as unknown as MenuItem['modifiers'],
    recipe: (r.recipe ?? undefined) as unknown as MenuItem['recipe'],
  }));
  menuStore.save(rows);
  void warmStorageUrls(MENU_BUCKET, rows.map(r => r.image));
  return rows;

}

// -- Tables ------------------------------------------------------------------
export const tableStore = {
  getAll: (): Table[] => getStore<Table>('tables'),
  save: (tables: Table[]) => setStore('tables', tables),
  add: (table: Omit<Table, 'id'>): Table => {
    const tables = tableStore.getAll();
    const newTable = { ...table, id: generateId() };
    tables.push(newTable);
    tableStore.save(tables);
    const t = tenantId();
    if (t && isUuid(newTable.id)) {
      void cloud('restaurant_tables').insert({
        id: newTable.id, tenant_id: t, number: newTable.number, seats: newTable.seats,
        status: newTable.status, current_order_id: newTable.currentOrderId ?? null,
      }).then(({ error }) => warn('tables.insert', error));
    }
    return newTable;
  },
  update: (id: string, updates: Partial<Table>) => {
    const tables = tableStore.getAll();
    const idx = tables.findIndex(x => x.id === id);
    if (idx !== -1) { tables[idx] = { ...tables[idx], ...updates }; tableStore.save(tables); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.number !== undefined) row.number = updates.number;
      if (updates.seats !== undefined) row.seats = updates.seats;
      if (updates.status !== undefined) row.status = updates.status;
      if (updates.currentOrderId !== undefined) row.current_order_id = updates.currentOrderId ?? null;
      if (Object.keys(row).length) {
        const ts = new Date().toISOString();
        row.client_updated_at = ts;
        void cloud('restaurant_tables').update(row as never).eq('id', id).eq('tenant_id', t)
          .guard('client_updated_at', ts).resource(id)
          .then(({ error }) => warn('tables.update', error));
      }

    }
    return tables[idx];
  },
  remove: (id: string) => {
    tableStore.save(tableStore.getAll().filter(x => x.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('restaurant_tables').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('tables.delete', error));
    }
  },
};

export async function fetchTables(t: string): Promise<Table[]> {
  const { data, error } = await supabase.from('restaurant_tables').select('*').eq('tenant_id', t);
  if (error) { warn('tables.fetch', error); return tableStore.getAll(); }
  const rows: Table[] = (data ?? []).map(r => ({
    id: r.id, number: r.number, seats: r.seats,
    status: r.status as Table['status'],
    currentOrderId: r.current_order_id ?? undefined,
  }));
  const merged = mergePending(rows, tableStore.getAll(), 'restaurant_tables');
  tableStore.save(merged);
  return merged;
}

// -- Orders ------------------------------------------------------------------
function orderRow(o: Partial<Order>, t?: string) {
  const row: Record<string, unknown> = {};
  if (t) row.tenant_id = t;
  if (o.tableId !== undefined) row.table_id = o.tableId && isUuid(o.tableId) ? o.tableId : null;
  if (o.tableNumber !== undefined) row.table_number = o.tableNumber ?? null;
  if (o.type !== undefined) row.type = o.type;
  if (o.status !== undefined) row.status = o.status;
  if (o.customerId !== undefined) row.customer_id = o.customerId && isUuid(o.customerId) ? o.customerId : null;
  if (o.customerName !== undefined) row.customer_name = o.customerName ?? null;
  if (o.customerPhone !== undefined) row.customer_phone = o.customerPhone ?? null;
  if (o.total !== undefined) row.total = o.total;
  if (o.discount !== undefined) row.discount = o.discount ?? 0;
  if (o.tip !== undefined) row.tip = o.tip ?? 0;
  if (o.packagingFee !== undefined) row.packaging_fee = o.packagingFee ?? 0;
  if (o.paymentMethod !== undefined) row.payment_method = o.paymentMethod ?? null;
  if (o.paid !== undefined) row.paid = o.paid;
  if (o.createdBy !== undefined) row.created_by = o.createdBy ?? null;
  if (o.closedBy !== undefined) row.closed_by = o.closedBy ?? null;
  if (o.cancelledBy !== undefined) row.cancelled_by = o.cancelledBy ?? null;
  if (o.closedAt !== undefined) row.closed_at = o.closedAt ?? null;
  if (o.cancelledAt !== undefined) row.cancelled_at = o.cancelledAt ?? null;
  return row;
}

function itemRows(orderId: string, items: OrderItem[]) {
  return items.map(i => ({
    id: isUuid(i.id) ? i.id : generateId(),
    order_id: orderId,
    menu_item_id: isUuid(i.menuItemId) ? i.menuItemId : null,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    modifiers: (i.modifiers ?? []) as never,
    notes: i.notes ?? null,
    status: i.status,
  }));
}

async function syncOrderItems(orderId: string, items: OrderItem[]) {
  const { error: delErr } = await cloud('order_items').delete().eq('order_id', orderId).resource(orderId);
  warn('orderItems.delete', delErr);
  if (!items.length) return;
  const { error } = await cloud('order_items').insert(itemRows(orderId, items) as never).resource(orderId);
  warn('orderItems.insert', error);
}

async function syncOrderEvents(orderId: string, events: OrderEvent[]) {
  if (!events.length) return;
  const rows = events.map(e => ({
    id: isUuid(e.id) ? e.id : generateId(),
    order_id: orderId,
    type: e.type,
    item_id: e.itemId && isUuid(e.itemId) ? e.itemId : null,
    item_name: e.itemName ?? null,
    actor: (e.actor ?? null) as never,
    note: e.note ?? null,
    at: e.at,
  }));
  const { error } = await cloud('order_events').upsert(rows as never, { onConflict: 'id' }).resource(orderId);
  warn('orderEvents.upsert', error);
}

export const orderStore = {
  getAll: (): Order[] => getStore<Order>('orders'),
  save: (orders: Order[]) => setStore('orders', orders),
  add: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order => {
    const orders = orderStore.getAll();
    const newOrder: Order = { ...order, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    orders.push(newOrder);
    orderStore.save(orders);
    const t = tenantId();
    if (t && isUuid(newOrder.id)) {
      void (async () => {
        const { error } = await cloud('orders').insert({
          id: newOrder.id, ...orderRow(newOrder, t),
          created_at: newOrder.createdAt, updated_at: newOrder.updatedAt,
          client_updated_at: newOrder.updatedAt,
        } as never).resource(newOrder.id);
        warn('orders.insert', error);
        if (error) return;
        await syncOrderItems(newOrder.id, newOrder.items ?? []);
        await syncOrderEvents(newOrder.id, newOrder.events ?? []);
      })();
    }
    return newOrder;
  },
  update: (id: string, updates: Partial<Order>) => {
    const orders = orderStore.getAll();
    const idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      orders[idx] = { ...orders[idx], ...updates, updatedAt: new Date().toISOString() };
      orderStore.save(orders);
    }
    const t = tenantId();
    if (t && isUuid(id) && idx !== -1) {
      const current = orders[idx];
      void (async () => {
        const row = orderRow(updates);
        row.updated_at = current.updatedAt;
        row.client_updated_at = current.updatedAt;
        // Last-write-wins: só aplica se o servidor não tiver uma versão mais recente.
        const { error } = await cloud('orders').update(row as never)
          .eq('id', id).eq('tenant_id', t)
          .guard('client_updated_at', current.updatedAt)
          .resource(id);
        warn('orders.update', error);
        if (updates.items) await syncOrderItems(id, updates.items);
        if (updates.events) await syncOrderEvents(id, updates.events);
      })();
    }
    return orders[idx];
  },
  getActive: (): Order[] => orderStore.getAll().filter(o => !o.paid && o.status !== 'cancelled'),
  /**
   * Dedicated write path for payment completion. Unlike `update()`, this
   * awaits the cloud write and rolls back the optimistic local patch when it
   * is permanently rejected (not merely queued for offline retry) — a
   * financial action must not silently vanish from the active list while
   * the server never actually recorded the payment.
   */
  completePayment: async (id: string, updates: Partial<Order>): Promise<{ ok: true } | { ok: false; error: string }> => {
    const orders = orderStore.getAll();
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return { ok: false, error: 'not-found' };
    const previous = orders[idx];
    const patched = { ...previous, ...updates, updatedAt: new Date().toISOString() };
    orders[idx] = patched;
    orderStore.save(orders);

    const t = tenantId();
    if (!t || !isUuid(id)) return { ok: true };

    const row = orderRow(updates);
    row.updated_at = patched.updatedAt;
    row.client_updated_at = patched.updatedAt;
    const { error } = await cloud('orders').update(row as never)
      .eq('id', id).eq('tenant_id', t)
      .guard('client_updated_at', previous.updatedAt)
      .resource(id);

    if (error) {
      const rollback = orderStore.getAll();
      const ridx = rollback.findIndex(o => o.id === id);
      if (ridx !== -1) { rollback[ridx] = previous; orderStore.save(rollback); }
      warn('orders.completePayment', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },
};


export async function fetchOrders(t: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), order_events(*)')
    .eq('tenant_id', t)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) { warn('orders.fetch', error); return orderStore.getAll(); }
  const rows: Order[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    tableId: (r.table_id as string) ?? undefined,
    tableNumber: (r.table_number as number) ?? undefined,
    type: r.type as Order['type'],
    status: r.status as Order['status'],
    customerId: (r.customer_id as string) ?? undefined,
    customerName: (r.customer_name as string) ?? undefined,
    customerPhone: (r.customer_phone as string) ?? undefined,
    total: Number(r.total ?? 0),
    discount: Number(r.discount ?? 0) || undefined,
    tip: Number(r.tip ?? 0) || undefined,
    packagingFee: Number(r.packaging_fee ?? 0) || undefined,
    paymentMethod: (r.payment_method as Order['paymentMethod']) ?? undefined,
    paid: Boolean(r.paid),
    createdBy: (r.created_by as Order['createdBy']) ?? undefined,
    closedBy: (r.closed_by as Order['closedBy']) ?? undefined,
    cancelledBy: (r.cancelled_by as Order['cancelledBy']) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    closedAt: (r.closed_at as string) ?? undefined,
    cancelledAt: (r.cancelled_at as string) ?? undefined,
    items: ((r.order_items ?? []) as Record<string, unknown>[]).map(i => ({
      id: i.id as string,
      menuItemId: (i.menu_item_id as string) ?? '',
      name: i.name as string,
      quantity: i.quantity as number,
      price: Number(i.price ?? 0),
      modifiers: (i.modifiers ?? []) as OrderItem['modifiers'],
      notes: (i.notes as string) ?? undefined,
      status: i.status as OrderItem['status'],
    })),
    events: ((r.order_events ?? []) as Record<string, unknown>[])
      .map(e => ({
        id: e.id as string,
        type: e.type as OrderEvent['type'],
        itemId: (e.item_id as string) ?? undefined,
        itemName: (e.item_name as string) ?? undefined,
        actor: (e.actor as OrderEvent['actor']) ?? undefined,
        note: (e.note as string) ?? undefined,
        at: e.at as string,
      }))
      .sort((a, b) => a.at.localeCompare(b.at)),
  }));
  const merged = mergePending(rows, orderStore.getAll(), ['orders', 'order_items', 'order_events']);
  orderStore.save(merged);
  return merged;
}


// -- Inventory ---------------------------------------------------------------
export const inventoryStore = {
  getAll: (): InventoryItem[] => getStore<InventoryItem>('inventory'),
  save: (items: InventoryItem[]) => setStore('inventory', items),
  add: (item: Omit<InventoryItem, 'id'>): InventoryItem => {
    const items = inventoryStore.getAll();
    const newItem = { ...item, id: generateId() };
    items.push(newItem);
    inventoryStore.save(items);
    const t = tenantId();
    if (t && isUuid(newItem.id)) {
      void cloud('inventory_items').insert({
        id: newItem.id, tenant_id: t, name: newItem.name, unit: newItem.unit,
        current_stock: newItem.currentStock, min_stock: newItem.minStock, cost_per_unit: newItem.costPerUnit,
        linked_menu_item_ids: newItem.linkedMenuItemIds.filter(isUuid),
        usage_per_serving: newItem.usagePerServing,
        icon: newItem.icon ?? null, image: newItem.image ?? null,
      }).then(({ error }) => warn('inventory.insert', error));
    }
    return newItem;
  },
  update: (id: string, updates: Partial<InventoryItem>) => {
    const items = inventoryStore.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; inventoryStore.save(items); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.unit !== undefined) row.unit = updates.unit;
      if (updates.currentStock !== undefined) row.current_stock = updates.currentStock;
      if (updates.minStock !== undefined) row.min_stock = updates.minStock;
      if (updates.costPerUnit !== undefined) row.cost_per_unit = updates.costPerUnit;
      if (updates.linkedMenuItemIds !== undefined) row.linked_menu_item_ids = updates.linkedMenuItemIds.filter(isUuid);
      if (updates.usagePerServing !== undefined) row.usage_per_serving = updates.usagePerServing;
      if (updates.icon !== undefined) row.icon = updates.icon ?? null;
      if (updates.image !== undefined) row.image = updates.image ?? null;
      if (Object.keys(row).length) {
        void cloud('inventory_items').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('inventory.update', error));
      }
    }
    return items[idx];
  },
  remove: (id: string) => {
    inventoryStore.save(inventoryStore.getAll().filter(i => i.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('inventory_items').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('inventory.delete', error));
    }
  },
  // Optimista e SÓ LOCAL: a dedução real é feita no servidor por um trigger
  // (deduct_inventory_on_order_item, disparado quando o order_item chega ao
  // Supabase), porque inventory_items só é escrevível por admin/manager e
  // um checkout pode ser feito por qualquer papel. Isto aqui só evita que o
  // ecrã de Estoque pareça desactualizado até à próxima sincronização —
  // NÃO envia nada para o Supabase (antes enviava, e ficava a competir com
  // o trigger, duplicando a dedução sempre que quem fazia o checkout era
  // admin/manager).
  deductForOrder: (menuItemId: string, quantity: number) => {
    const items = inventoryStore.getAll();
    items.forEach((inv, idx) => {
      if (inv.linkedMenuItemIds.includes(menuItemId)) {
        items[idx] = { ...inv, currentStock: Math.max(0, inv.currentStock - inv.usagePerServing * quantity) };
      }
    });
    inventoryStore.save(items);
  },
  getLowStock: (): InventoryItem[] => inventoryStore.getAll().filter(i => i.currentStock <= i.minStock),
};

export async function fetchInventory(t: string): Promise<InventoryItem[]> {
  const { data, error } = await supabase.from('inventory_items').select('*').eq('tenant_id', t);
  if (error) { warn('inventory.fetch', error); return inventoryStore.getAll(); }
  const rows: InventoryItem[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, unit: r.unit,
    currentStock: Number(r.current_stock), minStock: Number(r.min_stock),
    costPerUnit: Number(r.cost_per_unit), linkedMenuItemIds: r.linked_menu_item_ids ?? [],
    usagePerServing: Number(r.usage_per_serving),
    icon: r.icon ?? undefined, image: r.image ?? undefined,
  }));
  inventoryStore.save(rows);
  return rows;
}

// -- Customers ---------------------------------------------------------------
export const customerStore = {
  getAll: (): Customer[] => getStore<Customer>('customers'),
  save: (items: Customer[]) => setStore('customers', items),
  add: (c: Omit<Customer, 'id' | 'createdAt' | 'pointsAdjustment'> & { pointsAdjustment?: number }): Customer => {
    const all = customerStore.getAll();
    const created: Customer = { ...c, pointsAdjustment: c.pointsAdjustment ?? 0, id: generateId(), createdAt: new Date().toISOString() };
    all.push(created);
    customerStore.save(all);
    const t = tenantId();
    if (t && isUuid(created.id)) {
      void cloud('customers').insert({
        id: created.id, tenant_id: t, name: created.name, phone: created.phone,
        email: created.email ?? null, nuit: created.nuit ?? null, birthday: created.birthday ?? null,
        notes: created.notes ?? null, points_adjustment: created.pointsAdjustment,
      }).then(({ error }) => warn('customers.insert', error));
    }
    return created;
  },
  update: (id: string, updates: Partial<Customer>) => {
    const all = customerStore.getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates };
      customerStore.save(all);
    }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.phone !== undefined) row.phone = updates.phone;
      if (updates.email !== undefined) row.email = updates.email ?? null;
      if (updates.nuit !== undefined) row.nuit = updates.nuit ?? null;
      if (updates.birthday !== undefined) row.birthday = updates.birthday ?? null;
      if (updates.notes !== undefined) row.notes = updates.notes ?? null;
      if (updates.pointsAdjustment !== undefined) row.points_adjustment = updates.pointsAdjustment;
      if (Object.keys(row).length) {
        void cloud('customers').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('customers.update', error));
      }
    }
    return all[idx];
  },
  remove: (id: string) => {
    customerStore.save(customerStore.getAll().filter(c => c.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('customers').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('customers.delete', error));
    }
  },
  findByPhone: (phone: string): Customer | undefined => {
    const norm = phone.replace(/\D/g, '');
    if (!norm) return undefined;
    return customerStore.getAll().find(c => c.phone.replace(/\D/g, '') === norm);
  },
};

export async function fetchCustomers(t: string): Promise<Customer[]> {
  const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', t);
  if (error) { warn('customers.fetch', error); return customerStore.getAll(); }
  const rows: Customer[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, phone: r.phone, email: r.email ?? undefined,
    nuit: r.nuit ?? undefined, birthday: r.birthday ?? undefined, notes: r.notes ?? undefined,
    pointsAdjustment: r.points_adjustment ?? 0, createdAt: r.created_at,
  }));
  customerStore.save(rows);
  return rows;
}

// -- Staff -------------------------------------------------------------------
// Note: login por PIN foi descontinuado (ver AuthContext.loginWithPin) — o
// PIN de hoje é só um identificador rápido opcional, sem função de
// autenticação, por isso sincroniza como texto simples tal como os outros
// campos (antes só existia em localStorage e não viajava entre dispositivos).
export const staffStore = {
  getAll: (): Staff[] => getStore<Staff>('staff'),
  save: (staff: Staff[]) => setStore('staff', staff),
  add: (member: Omit<Staff, 'id'> & { id?: string }): Staff => {
    const all = staffStore.getAll();
    const newMember = { ...member, id: member.id || generateId() };
    all.push(newMember);
    staffStore.save(all);
    const t = tenantId();
    if (t && isUuid(newMember.id)) {
      void cloud('staff').insert({
        id: newMember.id, tenant_id: t, name: newMember.name, role: newMember.role,
        pin: newMember.pin || null,
      }).then(({ error }) => warn('staff.insert', error));
    }
    return newMember;
  },
  update: (id: string, updates: Partial<Staff>) => {
    const all = staffStore.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; staffStore.save(all); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.role !== undefined) row.role = updates.role;
      if (updates.pin !== undefined) row.pin = updates.pin || null;
      if (Object.keys(row).length) {
        void cloud('staff').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('staff.update', error));
      }
    }
    return all[idx];
  },
  remove: (id: string) => {
    staffStore.save(staffStore.getAll().filter(s => s.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('staff').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('staff.delete', error));
    }
  },
  findByPin: (pin: string): Staff | undefined => staffStore.getAll().find(s => s.pin === pin),
};

export async function fetchStaff(t: string): Promise<Staff[]> {
  const { data, error } = await supabase.from('staff').select('id, name, role, pin').eq('tenant_id', t);
  if (error) { warn('staff.fetch', error); return staffStore.getAll(); }
  // Fallback to a not-yet-synced local pin only if the server has none.
  const localById = new Map(staffStore.getAll().map(s => [s.id, s.pin]));
  const rows: Staff[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, role: r.role as Staff['role'], pin: r.pin ?? localById.get(r.id),
  }));
  staffStore.save(rows);
  return rows;
}

// Hydrate every tenant-scoped catalog cache in parallel.
export async function fetchTenantCatalog(t: string): Promise<void> {
  await Promise.all([
    fetchMenu(t).catch(() => {}),
    fetchTables(t).catch(() => {}),
    fetchInventory(t).catch(() => {}),
    fetchCustomers(t).catch(() => {}),
    fetchStaff(t).catch(() => {}),
    fetchOrders(t).catch(() => {}),
    fetchShifts(t).catch(() => {}),
    fetchSecurityAlerts(t).catch(() => {}),
  ]);
}

// -- Security alerts ---------------------------------------------------------
export const securityAlertStore = {
  getAll: (): SecurityAlert[] => getStore<SecurityAlert>('security_alerts'),
  save: (alerts: SecurityAlert[]) => setStore('security_alerts', alerts),
  add: (alert: Omit<SecurityAlert, 'id' | 'createdAt' | 'read'>): SecurityAlert => {
    const all = securityAlertStore.getAll();
    const newAlert: SecurityAlert = { ...alert, id: generateId(), createdAt: new Date().toISOString(), read: false };
    all.unshift(newAlert);
    securityAlertStore.save(all.slice(0, 50));
    const t = tenantId();
    if (t && isUuid(newAlert.id)) {
      void cloud('security_alerts').insert({
        id: newAlert.id, tenant_id: t, type: newAlert.type, message: newAlert.message,
        attempted_pin: newAlert.attemptedPin ?? null, attempts: newAlert.attempts ?? 1, read: false,
      }).then(({ error }) => warn('alerts.insert', error));
    }
    return newAlert;
  },
  markAllRead: () => {
    securityAlertStore.save(securityAlertStore.getAll().map(a => ({ ...a, read: true })));
    const t = tenantId();
    if (t) {
      void cloud('security_alerts').update({ read: true }).eq('tenant_id', t).eq('read', false)
        .then(({ error }) => warn('alerts.markRead', error));
    }
  },
  clearAll: () => {
    securityAlertStore.save([]);
    const t = tenantId();
    if (t) {
      void cloud('security_alerts').delete().eq('tenant_id', t)
        .then(({ error }) => warn('alerts.clear', error));
    }
  },
  remove: (id: string) => {
    securityAlertStore.save(securityAlertStore.getAll().filter(a => a.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('security_alerts').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('alerts.delete', error));
    }
  },
};

export async function fetchSecurityAlerts(t: string): Promise<SecurityAlert[]> {
  const { data, error } = await supabase.from('security_alerts').select('*')
    .eq('tenant_id', t).order('created_at', { ascending: false }).limit(50);
  if (error) { warn('alerts.fetch', error); return securityAlertStore.getAll(); }
  const rows: SecurityAlert[] = (data ?? []).map(r => ({
    id: r.id, type: r.type as SecurityAlert['type'], message: r.message,
    attemptedPin: r.attempted_pin ?? undefined, attempts: r.attempts ?? 1,
    read: r.read, createdAt: r.created_at,
  }));
  securityAlertStore.save(rows);
  return rows;
}

// -- Shifts ------------------------------------------------------------------
export const shiftStore = {
  getAll: (): Shift[] => getStore<Shift>('shifts'),
  save: (shifts: Shift[]) => setStore('shifts', shifts),
  add: (shift: Omit<Shift, 'id'>): Shift => {
    const all = shiftStore.getAll();
    const newShift = { ...shift, id: generateId() };
    all.push(newShift);
    shiftStore.save(all);
    const t = tenantId();
    if (t && isUuid(newShift.id) && isUuid(newShift.staffId)) {
      void cloud('shifts').insert({
        id: newShift.id, tenant_id: t, staff_id: newShift.staffId, staff_name: newShift.staffName,
        staff_role: newShift.staffRole, clock_in: newShift.clockIn,
        clock_out: newShift.clockOut ?? null, notes: newShift.notes ?? null,
      }).then(({ error }) => warn('shifts.insert', error));
    }
    return newShift;
  },
  update: (id: string, updates: Partial<Shift>) => {
    const all = shiftStore.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; shiftStore.save(all); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.clockIn !== undefined) row.clock_in = updates.clockIn;
      if (updates.clockOut !== undefined) row.clock_out = updates.clockOut ?? null;
      if (updates.notes !== undefined) row.notes = updates.notes ?? null;
      if (updates.staffName !== undefined) row.staff_name = updates.staffName;
      if (updates.staffRole !== undefined) row.staff_role = updates.staffRole;
      if (Object.keys(row).length) {
        void cloud('shifts').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('shifts.update', error));
      }
    }
    return all[idx];
  },
  remove: (id: string) => {
    shiftStore.save(shiftStore.getAll().filter(s => s.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('shifts').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('shifts.delete', error));
    }
  },
  getActiveForUser: (staffId: string): Shift | undefined =>
    shiftStore.getAll().find(s => s.staffId === staffId && !s.clockOut),
  clockIn: (staff: Staff): Shift => {
    const existing = shiftStore.getActiveForUser(staff.id);
    if (existing) return existing;
    return shiftStore.add({
      staffId: staff.id, staffName: staff.name, staffRole: staff.role,
      clockIn: new Date().toISOString(),
    });
  },
  clockOut: (staffId: string): Shift | undefined => {
    const active = shiftStore.getActiveForUser(staffId);
    if (!active) return undefined;
    return shiftStore.update(active.id, { clockOut: new Date().toISOString() });
  },
};

export async function fetchShifts(t: string): Promise<Shift[]> {
  const { data, error } = await supabase.from('shifts').select('*')
    .eq('tenant_id', t).order('clock_in', { ascending: false }).limit(500);
  if (error) { warn('shifts.fetch', error); return shiftStore.getAll(); }
  const rows: Shift[] = (data ?? []).map(r => ({
    id: r.id, staffId: r.staff_id, staffName: r.staff_name,
    staffRole: r.staff_role as Shift['staffRole'], clockIn: r.clock_in,
    clockOut: r.clock_out ?? undefined, notes: r.notes ?? undefined,
  }));
  // A clock-in/out started right after this fetch (mount-time race: this GET
  // is already in flight when the user acts) succeeds server-side but isn't
  // in `rows` yet — without this, the blind overwrite below would erase the
  // just-created local shift and the UI would show "off shift" again with no
  // periodic refresh to self-correct.
  const serverIds = new Set(rows.map(r => r.id));
  const stillLocalOnly = shiftStore.getAll().filter(s => !s.clockOut && !serverIds.has(s.id));
  const merged = [...rows, ...stillLocalOnly];
  shiftStore.save(merged);
  return merged;
}

// -- Realtime (KDS / Tables) --------------------------------------------------
// Subscribes to operational changes for the tenant and re-hydrates the local
// caches, then notifies the caller so the UI can re-render.
export function subscribeOperations(t: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      await Promise.all([fetchOrders(t).catch(() => {}), fetchTables(t).catch(() => {})]);
      onChange();
    }, 300);
  };

  const channel = supabase
    .channel(`ops-${t}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${t}` }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `tenant_id=eq.${t}` }, schedule)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, schedule)
    .subscribe();

  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}


export function seedData() {
  // Only seed within an active tenant scope, otherwise we would write to the
  // unprefixed legacy keys and leak across restaurants.
  const t = tenantId();
  if (!t) return;

  if (menuStore.getAll().length === 0) {
    const items: Omit<MenuItem, 'id'>[] = [
      { name: 'Pizza Pepperoni', price: 850, category: 'Popular', available: true, description: 'Classic pepperoni with mozzarella' },
      { name: 'Hambúrguer Gourmet', price: 720, category: 'Popular', available: true, description: 'Premium beef burger with special sauce' },
      { name: 'Sushi Roll Misto', price: 1200, category: 'Popular', available: true, description: 'Assorted sushi rolls' },
      { name: 'Frango Grelhado', price: 650, category: 'Pratos Principais', available: true, description: 'Grilled chicken with herbs' },
      { name: 'Salada Caesar', price: 450, category: 'Entradas', available: true, description: 'Fresh caesar salad' },
      { name: 'Sopa do Dia', price: 350, category: 'Entradas', available: true, description: 'Daily special soup' },
      { name: 'Refrigerante', price: 120, category: 'Bebidas', available: true, description: 'Soft drink' },
      { name: 'Suco Natural', price: 180, category: 'Bebidas', available: true, description: 'Fresh natural juice' },
      { name: 'Bolo de Chocolate', price: 380, category: 'Sobremesas', available: true, description: 'Rich chocolate cake' },
      { name: 'Gelado Artesanal', price: 280, category: 'Sobremesas', available: true, description: 'Artisan ice cream' },
    ];
    items.forEach(item => menuStore.add(item));
  }

  if (tableStore.getAll().length === 0) {
    for (let i = 1; i <= 8; i++) {
      tableStore.add({ number: i, seats: i <= 4 ? 4 : 6, status: 'free' });
    }
  }

  if (inventoryStore.getAll().length === 0) {
    const menuItems = menuStore.getAll();
    const pizzaId = menuItems.find(m => m.name.includes('Pizza'))?.id || '';
    const burgerId = menuItems.find(m => m.name.includes('Hambúrguer'))?.id || '';
    const chickenId = menuItems.find(m => m.name.includes('Frango'))?.id || '';
    const refriId = menuItems.find(m => m.name === 'Refrigerante')?.id || '';
    const seedInv: Omit<InventoryItem, 'id'>[] = [
      { name: 'Massa de Pizza', unit: 'un', currentStock: 50, minStock: 10, costPerUnit: 45, linkedMenuItemIds: [pizzaId], usagePerServing: 1 },
      { name: 'Queijo Mozzarella', unit: 'kg', currentStock: 8, minStock: 2, costPerUnit: 320, linkedMenuItemIds: [pizzaId, burgerId], usagePerServing: 0.2 },
      { name: 'Carne Bovina', unit: 'kg', currentStock: 12, minStock: 3, costPerUnit: 450, linkedMenuItemIds: [burgerId], usagePerServing: 0.25 },
      { name: 'Frango', unit: 'kg', currentStock: 15, minStock: 4, costPerUnit: 280, linkedMenuItemIds: [chickenId], usagePerServing: 0.3 },
      { name: 'Alface', unit: 'un', currentStock: 20, minStock: 5, costPerUnit: 15, linkedMenuItemIds: [burgerId], usagePerServing: 1 },
      { name: 'Refrigerante Lata', unit: 'un', currentStock: 100, minStock: 20, costPerUnit: 35, linkedMenuItemIds: [refriId], usagePerServing: 1 },
    ];
    seedInv.forEach(inv => inventoryStore.add(inv));
  }

  if (staffStore.getAll().length === 0) {
    const seedStaff: Omit<Staff, 'id'>[] = [
      { name: 'Gerente', role: 'manager', pin: '1111' },
      { name: 'Caixa', role: 'cashier', pin: '2222' },
      { name: 'Garçom', role: 'waiter', pin: '3333' },
      { name: 'Cozinha', role: 'kitchen', pin: '4444' },
    ];
    seedStaff.forEach(s => staffStore.add(s));
  }
}
