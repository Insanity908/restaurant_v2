import { MenuItem, Table, Order, Staff, InventoryItem, Shift, SecurityAlert, Customer } from '@/types/restaurant';
import { syncQueue } from './syncQueue';
import { supabase } from '@/integrations/supabase/client';

// Tenant-scoped keys: automatically prefixed with the active tenant id so that
// each restaurant has its own isolated data in localStorage.
const TENANT_SCOPED = new Set([
  'menu_items', 'tables', 'orders', 'inventory', 'customers',
  'staff', 'security_alerts', 'shifts',
]);

function scopedKey(key: string): string {
  if (!TENANT_SCOPED.has(key)) return key;
  const tenantId = localStorage.getItem('current_tenant_id');
  return tenantId ? `${tenantId}__${key}` : key;
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
      void supabase.from('menu_items').insert({
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
        void supabase.from('menu_items').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('menu.update', error));
      }
    }
    return items[idx];
  },
  remove: (id: string) => {
    menuStore.save(menuStore.getAll().filter(i => i.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void supabase.from('menu_items').delete().eq('id', id).eq('tenant_id', t)
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
      void supabase.from('restaurant_tables').insert({
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
        void supabase.from('restaurant_tables').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('tables.update', error));
      }
    }
    return tables[idx];
  },
  remove: (id: string) => {
    tableStore.save(tableStore.getAll().filter(x => x.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void supabase.from('restaurant_tables').delete().eq('id', id).eq('tenant_id', t)
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
  tableStore.save(rows);
  return rows;
}

// -- Orders (still local-only; Phase 2C will migrate) ------------------------
export const orderStore = {
  getAll: (): Order[] => getStore<Order>('orders'),
  save: (orders: Order[]) => setStore('orders', orders),
  add: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order => {
    const orders = orderStore.getAll();
    const newOrder: Order = { ...order, id: generateId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    orders.push(newOrder);
    orderStore.save(orders);
    return newOrder;
  },
  update: (id: string, updates: Partial<Order>) => {
    const orders = orderStore.getAll();
    const idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      orders[idx] = { ...orders[idx], ...updates, updatedAt: new Date().toISOString() };
      orderStore.save(orders);
    }
    return orders[idx];
  },
  getActive: (): Order[] => orderStore.getAll().filter(o => !o.paid && o.status !== 'cancelled'),
};

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
      void supabase.from('inventory_items').insert({
        id: newItem.id, tenant_id: t, name: newItem.name, unit: newItem.unit,
        current_stock: newItem.currentStock, min_stock: newItem.minStock, cost_per_unit: newItem.costPerUnit,
        linked_menu_item_ids: newItem.linkedMenuItemIds.filter(isUuid),
        usage_per_serving: newItem.usagePerServing,
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
      if (Object.keys(row).length) {
        void supabase.from('inventory_items').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('inventory.update', error));
      }
    }
    return items[idx];
  },
  remove: (id: string) => {
    inventoryStore.save(inventoryStore.getAll().filter(i => i.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void supabase.from('inventory_items').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('inventory.delete', error));
    }
  },
  deductForOrder: (menuItemId: string, quantity: number) => {
    const items = inventoryStore.getAll();
    const changed: InventoryItem[] = [];
    items.forEach((inv, idx) => {
      if (inv.linkedMenuItemIds.includes(menuItemId)) {
        const next = { ...inv, currentStock: Math.max(0, inv.currentStock - inv.usagePerServing * quantity) };
        items[idx] = next; changed.push(next);
      }
    });
    inventoryStore.save(items);
    const t = tenantId();
    if (t) {
      changed.filter(c => isUuid(c.id)).forEach(c => {
        void supabase.from('inventory_items').update({ current_stock: c.currentStock })
          .eq('id', c.id).eq('tenant_id', t).then(({ error }) => warn('inventory.deduct', error));
      });
    }
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
    syncQueue.enqueue({ entity: 'customer', type: 'create', entityId: created.id, payload: created });
    const t = tenantId();
    if (t && isUuid(created.id)) {
      void supabase.from('customers').insert({
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
      syncQueue.enqueue({ entity: 'customer', type: 'update', entityId: id, payload: all[idx] });
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
        void supabase.from('customers').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('customers.update', error));
      }
    }
    return all[idx];
  },
  remove: (id: string) => {
    customerStore.save(customerStore.getAll().filter(c => c.id !== id));
    syncQueue.enqueue({ entity: 'customer', type: 'delete', entityId: id });
    const t = tenantId();
    if (t && isUuid(id)) {
      void supabase.from('customers').delete().eq('id', id).eq('tenant_id', t)
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
// Note: PINs are being deprecated in favor of per-staff Supabase Auth accounts.
// We mirror name/role only; `pin` remains local until PIN auth is fully removed.
export const staffStore = {
  getAll: (): Staff[] => getStore<Staff>('staff'),
  save: (staff: Staff[]) => setStore('staff', staff),
  add: (member: Omit<Staff, 'id'>): Staff => {
    const all = staffStore.getAll();
    const newMember = { ...member, id: generateId() };
    all.push(newMember);
    staffStore.save(all);
    const t = tenantId();
    if (t && isUuid(newMember.id)) {
      void supabase.from('staff').insert({
        id: newMember.id, tenant_id: t, name: newMember.name, role: newMember.role,
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
      if (Object.keys(row).length) {
        void supabase.from('staff').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => warn('staff.update', error));
      }
    }
    return all[idx];
  },
  remove: (id: string) => {
    staffStore.save(staffStore.getAll().filter(s => s.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void supabase.from('staff').delete().eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('staff.delete', error));
    }
  },
  findByPin: (pin: string): Staff | undefined => staffStore.getAll().find(s => s.pin === pin),
};

export async function fetchStaff(t: string): Promise<Staff[]> {
  const { data, error } = await supabase.from('staff').select('id, name, role').eq('tenant_id', t);
  if (error) { warn('staff.fetch', error); return staffStore.getAll(); }
  // Preserve any local `pin` values that only exist client-side.
  const localById = new Map(staffStore.getAll().map(s => [s.id, s.pin]));
  const rows: Staff[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, role: r.role as Staff['role'], pin: localById.get(r.id),
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
    return newAlert;
  },
  markAllRead: () => { securityAlertStore.save(securityAlertStore.getAll().map(a => ({ ...a, read: true }))); },
  clearAll: () => { securityAlertStore.save([]); },
  remove: (id: string) => { securityAlertStore.save(securityAlertStore.getAll().filter(a => a.id !== id)); },
};

// -- Shifts ------------------------------------------------------------------
export const shiftStore = {
  getAll: (): Shift[] => getStore<Shift>('shifts'),
  save: (shifts: Shift[]) => setStore('shifts', shifts),
  add: (shift: Omit<Shift, 'id'>): Shift => {
    const all = shiftStore.getAll();
    const newShift = { ...shift, id: generateId() };
    all.push(newShift);
    shiftStore.save(all);
    return newShift;
  },
  update: (id: string, updates: Partial<Shift>) => {
    const all = shiftStore.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; shiftStore.save(all); }
    return all[idx];
  },
  remove: (id: string) => { shiftStore.save(shiftStore.getAll().filter(s => s.id !== id)); },
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
