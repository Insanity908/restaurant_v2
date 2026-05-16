import { MenuItem, Table, Order, Staff, InventoryItem, Shift, SecurityAlert } from '@/types/restaurant';

// Generic localStorage CRUD with offline support

function getStore<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setStore<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Menu Items
export const menuStore = {
  getAll: (): MenuItem[] => getStore<MenuItem>('menu_items'),
  save: (items: MenuItem[]) => setStore('menu_items', items),
  add: (item: Omit<MenuItem, 'id'>): MenuItem => {
    const items = menuStore.getAll();
    const newItem = { ...item, id: generateId() };
    items.push(newItem);
    menuStore.save(items);
    return newItem;
  },
  update: (id: string, updates: Partial<MenuItem>) => {
    const items = menuStore.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; menuStore.save(items); }
    return items[idx];
  },
  remove: (id: string) => {
    menuStore.save(menuStore.getAll().filter(i => i.id !== id));
  },
};

// Tables
export const tableStore = {
  getAll: (): Table[] => getStore<Table>('tables'),
  save: (tables: Table[]) => setStore('tables', tables),
  add: (table: Omit<Table, 'id'>): Table => {
    const tables = tableStore.getAll();
    const newTable = { ...table, id: generateId() };
    tables.push(newTable);
    tableStore.save(tables);
    return newTable;
  },
  update: (id: string, updates: Partial<Table>) => {
    const tables = tableStore.getAll();
    const idx = tables.findIndex(t => t.id === id);
    if (idx !== -1) { tables[idx] = { ...tables[idx], ...updates }; tableStore.save(tables); }
    return tables[idx];
  },
  remove: (id: string) => {
    tableStore.save(tableStore.getAll().filter(t => t.id !== id));
  },
};

// Orders
export const orderStore = {
  getAll: (): Order[] => getStore<Order>('orders'),
  save: (orders: Order[]) => setStore('orders', orders),
  add: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order => {
    const orders = orderStore.getAll();
    const newOrder: Order = {
      ...order,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
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

// Inventory
export const inventoryStore = {
  getAll: (): InventoryItem[] => getStore<InventoryItem>('inventory'),
  save: (items: InventoryItem[]) => setStore('inventory', items),
  add: (item: Omit<InventoryItem, 'id'>): InventoryItem => {
    const items = inventoryStore.getAll();
    const newItem = { ...item, id: generateId() };
    items.push(newItem);
    inventoryStore.save(items);
    return newItem;
  },
  update: (id: string, updates: Partial<InventoryItem>) => {
    const items = inventoryStore.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; inventoryStore.save(items); }
    return items[idx];
  },
  remove: (id: string) => {
    inventoryStore.save(inventoryStore.getAll().filter(i => i.id !== id));
  },
  deductForOrder: (menuItemId: string, quantity: number) => {
    const items = inventoryStore.getAll();
    items.forEach((inv, idx) => {
      if (inv.linkedMenuItemIds.includes(menuItemId)) {
        items[idx] = { ...inv, currentStock: Math.max(0, inv.currentStock - inv.usagePerServing * quantity) };
      }
    });
    inventoryStore.save(items);
  },
  getLowStock: (): InventoryItem[] => {
    return inventoryStore.getAll().filter(i => i.currentStock <= i.minStock);
  },
};

// Staff
export const staffStore = {
  getAll: (): Staff[] => getStore<Staff>('staff'),
  save: (staff: Staff[]) => setStore('staff', staff),
  add: (member: Omit<Staff, 'id'>): Staff => {
    const all = staffStore.getAll();
    const newMember = { ...member, id: generateId() };
    all.push(newMember);
    staffStore.save(all);
    return newMember;
  },
  update: (id: string, updates: Partial<Staff>) => {
    const all = staffStore.getAll();
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; staffStore.save(all); }
    return all[idx];
  },
  remove: (id: string) => {
    staffStore.save(staffStore.getAll().filter(s => s.id !== id));
  },
  findByPin: (pin: string): Staff | undefined => {
    return staffStore.getAll().find(s => s.pin === pin);
  },
};

// Security alerts for managers/admins
export const securityAlertStore = {
  getAll: (): SecurityAlert[] => getStore<SecurityAlert>('security_alerts'),
  save: (alerts: SecurityAlert[]) => setStore('security_alerts', alerts),
  add: (alert: Omit<SecurityAlert, 'id' | 'createdAt' | 'read'>): SecurityAlert => {
    const all = securityAlertStore.getAll();
    const newAlert: SecurityAlert = {
      ...alert,
      id: generateId(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    all.unshift(newAlert);
    securityAlertStore.save(all.slice(0, 50));
    return newAlert;
  },
  markAllRead: () => {
    securityAlertStore.save(securityAlertStore.getAll().map(alert => ({ ...alert, read: true })));
  },
  clearAll: () => {
    securityAlertStore.save([]);
  },
  remove: (id: string) => {
    securityAlertStore.save(securityAlertStore.getAll().filter(a => a.id !== id));
  },
};

// Shifts (clock in / out)
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
  remove: (id: string) => {
    shiftStore.save(shiftStore.getAll().filter(s => s.id !== id));
  },
  getActiveForUser: (staffId: string): Shift | undefined => {
    return shiftStore.getAll().find(s => s.staffId === staffId && !s.clockOut);
  },
  clockIn: (staff: Staff): Shift => {
    const existing = shiftStore.getActiveForUser(staff.id);
    if (existing) return existing;
    return shiftStore.add({
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role,
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
      { name: 'Administrador', role: 'admin', pin: '0000' },
      { name: 'Gerente', role: 'manager', pin: '1111' },
      { name: 'Caixa', role: 'cashier', pin: '2222' },
      { name: 'Garçom', role: 'waiter', pin: '3333' },
      { name: 'Cozinha', role: 'kitchen', pin: '4444' },
    ];
    seedStaff.forEach(s => staffStore.add(s));
  }
}
