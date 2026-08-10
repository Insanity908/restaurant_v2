import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * A camada `store.ts` fala com o Supabase de duas formas:
 *  - leituras (`fetchX`) via `supabase.from(...)`
 *  - escritas via `cloud(table)` (outbox com fila offline)
 *
 * Para testar a lógica de persistência local + o payload exacto que seria
 * enviado, mockamos ambas para nunca tocar a rede, e capturamos cada
 * chamada a `cloud()` num array inspeccionável pelos testes.
 */

type CloudCall = {
  table: string;
  action: 'insert' | 'update' | 'delete' | 'upsert';
  values?: unknown;
  eq: [string, unknown][];
};

const cloudCalls: CloudCall[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/outbox', () => {
  function makeBuilder(table: string, action: CloudCall['action'], values?: unknown) {
    const call: CloudCall = { table, action, values, eq: [] };
    cloudCalls.push(call);
    const builder = {
      eq: (col: string, val: unknown) => { call.eq.push([col, val]); return builder; },
      guard: () => builder,
      resource: () => builder,
      then: (resolve: (v: { error: null }) => void) => { resolve({ error: null }); return Promise.resolve(); },
    };
    return builder;
  }
  return {
    cloud: (table: string) => ({
      insert: (values: unknown) => makeBuilder(table, 'insert', values),
      upsert: (values: unknown) => makeBuilder(table, 'upsert', values),
      update: (values: unknown) => makeBuilder(table, 'update', values),
      delete: () => makeBuilder(table, 'delete'),
    }),
    pendingResourceIds: () => new Set<string>(),
  };
});

vi.mock('@/lib/storage', () => ({
  warmStorageUrls: vi.fn().mockResolvedValue(undefined),
  MENU_BUCKET: 'menu-images',
}));

// Importado DEPOIS dos vi.mock (hoisted pelo Vitest para o topo do módulo,
// por isso a ordem no ficheiro não importa, mas mantém-se aqui por clareza).
import {
  menuStore, tableStore, inventoryStore, customerStore, staffStore, orderStore,
} from '@/lib/store';

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function setTenant(id: string | null) {
  if (id) localStorage.setItem('current_tenant_id', id);
  else localStorage.removeItem('current_tenant_id');
}

beforeEach(() => {
  localStorage.clear();
  cloudCalls.length = 0;
  setTenant(TENANT_A);
});

describe('menuStore', () => {
  it('adiciona um prato: persiste localmente e envia o payload correcto para o Supabase', () => {
    const created = menuStore.add({
      name: 'Pizza Marguerita', price: 500, category: 'Pizzas', available: true,
    });

    expect(created.id).toBeTruthy();
    expect(menuStore.getAll()).toHaveLength(1);
    expect(menuStore.getAll()[0].name).toBe('Pizza Marguerita');

    const call = cloudCalls.find(c => c.table === 'menu_items' && c.action === 'insert');
    expect(call).toBeDefined();
    expect(call?.values).toMatchObject({
      id: created.id, tenant_id: TENANT_A, name: 'Pizza Marguerita', price: 500,
      category: 'Pizzas', available: true,
    });
  });

  it('actualiza um prato: só envia as colunas alteradas', () => {
    const created = menuStore.add({ name: 'Sopa', price: 200, category: 'Entradas', available: true });
    cloudCalls.length = 0;

    menuStore.update(created.id, { price: 250 });

    expect(menuStore.getAll()[0].price).toBe(250);
    const call = cloudCalls.find(c => c.table === 'menu_items' && c.action === 'update');
    expect(call?.values).toEqual({ price: 250 });
    expect(call?.eq).toContainEqual(['id', created.id]);
    expect(call?.eq).toContainEqual(['tenant_id', TENANT_A]);
  });

  it('remove um prato local e na nuvem', () => {
    const created = menuStore.add({ name: 'Bolo', price: 100, category: 'Sobremesas', available: true });
    menuStore.remove(created.id);

    expect(menuStore.getAll()).toHaveLength(0);
    expect(cloudCalls.some(c => c.table === 'menu_items' && c.action === 'delete')).toBe(true);
  });
});

describe('tableStore', () => {
  it('adiciona uma mesa e envia o número/lugares/estado correctos', () => {
    const created = tableStore.add({ number: 4, seats: 6, status: 'free' });
    const call = cloudCalls.find(c => c.table === 'restaurant_tables' && c.action === 'insert');
    expect(call?.values).toMatchObject({ number: 4, seats: 6, status: 'free', tenant_id: TENANT_A });
    expect(created.number).toBe(4);
  });

  it('actualiza o estado da mesa (ex: ocupar) com guard de last-write-wins', () => {
    const created = tableStore.add({ number: 1, seats: 2, status: 'free' });
    cloudCalls.length = 0;

    tableStore.update(created.id, { status: 'occupied' });

    expect(tableStore.getAll()[0].status).toBe('occupied');
    const call = cloudCalls.find(c => c.table === 'restaurant_tables' && c.action === 'update');
    expect(call?.values).toMatchObject({ status: 'occupied' });
  });
});

describe('inventoryStore', () => {
  it('adiciona um item de stock com o payload correcto', () => {
    const created = inventoryStore.add({
      name: 'Farinha', unit: 'kg', currentStock: 10, minStock: 2, costPerUnit: 50,
      linkedMenuItemIds: [], usagePerServing: 0.5,
    });
    const call = cloudCalls.find(c => c.table === 'inventory_items' && c.action === 'insert');
    expect(call?.values).toMatchObject({ name: 'Farinha', current_stock: 10, min_stock: 2 });
    expect(created.currentStock).toBe(10);
  });

  it('REGRESSÃO: deductForOrder só altera o estado local — não escreve na nuvem', () => {
    // A dedução de stock no checkout é feita por um trigger no servidor
    // (deduct_inventory_on_order_item), precisamente porque qualquer papel
    // (incl. cashier/waiter, que não têm escrita em inventory_items) pode
    // desencadear uma venda. Se este teste falhar com chamadas cloud
    // presentes, o bug da dedução "invisível" (RLS a filtrar em silêncio)
    // pode ter voltado.
    const created = inventoryStore.add({
      name: 'Frango', unit: 'kg', currentStock: 15, minStock: 4, costPerUnit: 280,
      linkedMenuItemIds: ['menu-item-1'], usagePerServing: 0.3,
    });
    cloudCalls.length = 0;

    inventoryStore.deductForOrder('menu-item-1', 2);

    expect(inventoryStore.getAll()[0].currentStock).toBeCloseTo(14.4);
    expect(cloudCalls).toHaveLength(0);
  });

  it('deductForOrder nunca deixa o stock ficar negativo', () => {
    inventoryStore.add({
      name: 'Queijo', unit: 'kg', currentStock: 1, minStock: 1, costPerUnit: 300,
      linkedMenuItemIds: ['menu-item-2'], usagePerServing: 5,
    });
    inventoryStore.deductForOrder('menu-item-2', 3);
    expect(inventoryStore.getAll()[0].currentStock).toBe(0);
  });
});

describe('customerStore', () => {
  it('adiciona um cliente com pointsAdjustment por omissão', () => {
    const created = customerStore.add({ name: 'Maria João', phone: '841234567' });
    expect(created.pointsAdjustment).toBe(0);
    const call = cloudCalls.find(c => c.table === 'customers' && c.action === 'insert');
    expect(call?.values).toMatchObject({ name: 'Maria João', phone: '841234567', points_adjustment: 0 });
  });

  it('encontra cliente por telefone ignorando formatação', () => {
    customerStore.add({ name: 'João', phone: '84 123 4567' });
    expect(customerStore.findByPhone('841234567')).toBeDefined();
    expect(customerStore.findByPhone('999999999')).toBeUndefined();
  });
});

describe('staffStore', () => {
  it('adiciona funcionário com id explícito (fluxo de conta real) e sincroniza o PIN', () => {
    const explicitId = 'cccccccc-0000-0000-0000-000000000099';
    const created = staffStore.add({ id: explicitId, name: 'Ana Caixa', role: 'cashier', pin: '1234' });

    expect(created.id).toBe(explicitId);
    const call = cloudCalls.find(c => c.table === 'staff' && c.action === 'insert');
    expect(call?.values).toMatchObject({ id: explicitId, name: 'Ana Caixa', role: 'cashier', pin: '1234' });
  });

  it('gera id quando nenhum é fornecido', () => {
    const created = staffStore.add({ name: 'Bruno Garçom', role: 'waiter', pin: '4321' });
    expect(created.id).toBeTruthy();
    expect(staffStore.findByPin('4321')?.name).toBe('Bruno Garçom');
  });

  it('actualização de PIN é enviada para a nuvem', () => {
    const created = staffStore.add({ name: 'Carla', role: 'kitchen', pin: '1111' });
    cloudCalls.length = 0;
    staffStore.update(created.id, { pin: '2222' });
    const call = cloudCalls.find(c => c.table === 'staff' && c.action === 'update');
    expect(call?.values).toMatchObject({ pin: '2222' });
  });
});

describe('orderStore', () => {
  it('cria um pedido: calcula id/createdAt/updatedAt e envia o insert para "orders"', () => {
    const order = orderStore.add({
      type: 'dine-in', status: 'active', items: [], total: 700, paid: false,
    });
    expect(order.id).toBeTruthy();
    expect(order.createdAt).toBeTruthy();
    expect(order.updatedAt).toBe(order.createdAt);

    const call = cloudCalls.find(c => c.table === 'orders' && c.action === 'insert');
    expect(call).toBeDefined();
    expect(call?.values).toMatchObject({ id: order.id, tenant_id: TENANT_A, type: 'dine-in', total: 700 });
  });
});

describe('isolamento entre restaurantes (tenant scoping)', () => {
  it('dados criados no restaurante A não aparecem depois de mudar para o B', () => {
    menuStore.add({ name: 'Só existe no A', price: 100, category: 'x', available: true });
    expect(menuStore.getAll()).toHaveLength(1);

    setTenant(TENANT_B);
    expect(menuStore.getAll()).toHaveLength(0);

    setTenant(TENANT_A);
    expect(menuStore.getAll()).toHaveLength(1);
  });
});
