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

// `mockFromData`/`pendingIdsRef` precisam de existir ANTES dos vi.mock (que o
// Vitest içа para o topo do módulo) — `vi.hoisted` garante isso e continua
// acessível no corpo do teste para configurar cada caso.
const { mockFromData, pendingIdsRef, channelSpy, removeChannelSpy } = vi.hoisted(() => ({
  mockFromData: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
  pendingIdsRef: { current: new Set<string>() },
  channelSpy: { calls: [] as string[] },
  removeChannelSpy: { count: 0 },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      // `.eq()`/`.order()` são o fim da cadeia em fetchMenu/fetchInventory
      // (sem `.limit()`) — por isso o próprio builder tem de ser "thenable"
      // para `await` funcionar não importa onde a cadeia pare.
      const result = () => mockFromData[table] ?? { data: [], error: null };
      const builder: {
        select: () => typeof builder;
        eq: () => typeof builder;
        order: () => typeof builder;
        limit: () => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        then: (
          resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise<unknown>;
      } = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(result()),
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn((name: string) => {
      channelSpy.calls.push(name);
      return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
    }),
    removeChannel: vi.fn(() => { removeChannelSpy.count += 1; }),
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
    pendingResourceIds: () => pendingIdsRef.current,
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
  fetchMenu, fetchInventory, subscribeOperations, subscribeLicense,
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
  for (const k of Object.keys(mockFromData)) delete mockFromData[k];
  pendingIdsRef.current = new Set();
  channelSpy.calls.length = 0;
  removeChannelSpy.count = 0;
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

    const call = cloudCalls.find(c => c.table === 'menu_items' && c.action === 'upsert');
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
    // client_updated_at também vai (guard de last-write-wins, ver tableStore) —
    // só as colunas de negócio inalteradas é que ficam de fora.
    expect(call?.values).toMatchObject({ price: 250 });
    expect((call?.values as Record<string, unknown>)?.client_updated_at).toEqual(expect.any(String));
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
    const call = cloudCalls.find(c => c.table === 'restaurant_tables' && c.action === 'upsert');
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
    const call = cloudCalls.find(c => c.table === 'inventory_items' && c.action === 'upsert');
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
    const call = cloudCalls.find(c => c.table === 'customers' && c.action === 'upsert');
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
    const call = cloudCalls.find(c => c.table === 'staff' && c.action === 'upsert');
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

    const call = cloudCalls.find(c => c.table === 'orders' && c.action === 'upsert');
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

describe('inventoryStore — guard de last-write-wins (client_updated_at)', () => {
  it('actualizar um item de stock envia client_updated_at + guard, tal como menu/mesas', () => {
    const created = inventoryStore.add({
      name: 'Arroz', unit: 'kg', currentStock: 20, minStock: 5, costPerUnit: 60,
      linkedMenuItemIds: [], usagePerServing: 0.2,
    });
    cloudCalls.length = 0;

    inventoryStore.update(created.id, { currentStock: 18 });

    expect(inventoryStore.getAll()[0].currentStock).toBe(18);
    const call = cloudCalls.find(c => c.table === 'inventory_items' && c.action === 'update');
    expect(call?.values).toMatchObject({ current_stock: 18 });
    expect((call?.values as Record<string, unknown>)?.client_updated_at).toEqual(expect.any(String));
    expect(call?.eq).toContainEqual(['id', created.id]);
    expect(call?.eq).toContainEqual(['tenant_id', TENANT_A]);
  });
});

describe('mergePending — protege edições pendentes contra um refetch desactualizado', () => {
  it('fetchMenu: mantém a versão local de um item ainda na fila da outbox em vez do valor (mais antigo) do servidor', async () => {
    const created = menuStore.add({ name: 'Bife', price: 300, category: 'Pratos', available: true });
    // Simula uma edição offline ainda não confirmada pelo servidor.
    menuStore.update(created.id, { price: 350 });
    pendingIdsRef.current = new Set([created.id]);

    // O servidor devolve o valor ANTIGO (a escrita ainda não chegou lá).
    mockFromData.menu_items = {
      data: [{
        id: created.id, name: 'Bife', price: 300, category: 'Pratos',
        description: null, image_path: null, available: true, modifiers: [], recipe: null,
      }],
      error: null,
    };

    const result = await fetchMenu(TENANT_A);
    expect(result.find(r => r.id === created.id)?.price).toBe(350);
  });

  it('fetchInventory: um item pendente que o servidor ainda não devolve nenhuma linha continua na lista', async () => {
    const created = inventoryStore.add({
      name: 'Óleo', unit: 'L', currentStock: 5, minStock: 1, costPerUnit: 120,
      linkedMenuItemIds: [], usagePerServing: 0.1,
    });
    pendingIdsRef.current = new Set([created.id]);
    // Servidor não tem nenhuma linha (insert offline ainda não sincronizado).
    mockFromData.inventory_items = { data: [], error: null };

    const result = await fetchInventory(TENANT_A);
    expect(result.some(r => r.id === created.id)).toBe(true);
  });

  it('fetchInventory: sem nenhuma edição pendente, o valor do servidor prevalece normalmente', async () => {
    const created = inventoryStore.add({
      name: 'Sal', unit: 'kg', currentStock: 10, minStock: 1, costPerUnit: 20,
      linkedMenuItemIds: [], usagePerServing: 0.05,
    });
    // pendingIdsRef vazio (default do beforeEach) — nada em trânsito.
    mockFromData.inventory_items = {
      data: [{
        id: created.id, name: 'Sal', current_stock: 7, min_stock: 1, cost_per_unit: 20,
        linked_menu_item_ids: [], usage_per_serving: 0.05, icon: null, image: null,
      }],
      error: null,
    };

    const result = await fetchInventory(TENANT_A);
    expect(result.find(r => r.id === created.id)?.currentStock).toBe(7);
  });
});

describe('subscribeOperations — canal partilhado e referência-contada por tenant', () => {
  it('duas subscrições para o mesmo tenant abrem só UM canal Supabase', () => {
    const tenant = 'ops-tenant-shared-1';
    const unsub1 = subscribeOperations(tenant, () => {});
    const unsub2 = subscribeOperations(tenant, () => {});

    expect(channelSpy.calls.filter(n => n === `ops-${tenant}`)).toHaveLength(1);

    unsub1();
    unsub2();
  });

  it('cancelar UMA das duas subscrições não fecha o canal enquanto a outra estiver activa', () => {
    const tenant = 'ops-tenant-shared-2';
    const unsub1 = subscribeOperations(tenant, () => {});
    const unsub2 = subscribeOperations(tenant, () => {});

    unsub1();
    expect(removeChannelSpy.count).toBe(0);

    unsub2();
    expect(removeChannelSpy.count).toBe(1);
  });

  it('cancelar a mesma subscrição duas vezes não fecha o canal duas vezes', () => {
    const tenant = 'ops-tenant-shared-3';
    const unsub1 = subscribeOperations(tenant, () => {});
    const unsub2 = subscribeOperations(tenant, () => {});

    unsub1();
    unsub1(); // idempotente: já não está no Set de listeners
    unsub2();

    expect(removeChannelSpy.count).toBe(1);
  });

  it('tenants diferentes abrem canais distintos', () => {
    const tenantA = 'ops-tenant-distinct-a';
    const tenantB = 'ops-tenant-distinct-b';
    const unsubA = subscribeOperations(tenantA, () => {});
    const unsubB = subscribeOperations(tenantB, () => {});

    expect(channelSpy.calls).toContain(`ops-${tenantA}`);
    expect(channelSpy.calls).toContain(`ops-${tenantB}`);

    unsubA();
    unsubB();
  });
});

/**
 * Regressão: a primeira versão de `useLicense` (T3.3) abria um
 * `supabase.channel('license-<tenant>').on(...).subscribe()` directo dentro
 * do próprio hook. Como `useLicense()` é chamado de vários sítios ao mesmo
 * tempo na mesma página (AppSidebar + RequireLicense + a própria página), a
 * SEGUNDA chamada tentava abrir um canal com o MESMO nome de tópico — e o
 * supabase-js devolve o canal já existente em vez de criar um novo,
 * fazendo o `.on()` da segunda chamada rebentar com "cannot add
 * postgres_changes callbacks ... after subscribe()". Isto partiu 15 dos 20
 * specs Cypress (praticamente todas as páginas com sidebar) antes de ser
 * apanhado. `subscribeLicense` é o mesmo padrão partilhado/com contagem de
 * referências que `subscribeOperations` já usava — este teste é
 * exactamente o que teria apanhado o bug se existisse antes do T3.3.
 */
describe('subscribeLicense — canal partilhado e referência-contada por tenant', () => {
  it('duas subscrições para o mesmo tenant abrem só UM canal Supabase', () => {
    const tenant = 'license-tenant-shared-1';
    const unsub1 = subscribeLicense(tenant, () => {});
    const unsub2 = subscribeLicense(tenant, () => {});

    expect(channelSpy.calls.filter(n => n === `license-${tenant}`)).toHaveLength(1);

    unsub1();
    unsub2();
  });

  it('cancelar UMA das duas subscrições não fecha o canal enquanto a outra estiver activa', () => {
    const tenant = 'license-tenant-shared-2';
    const unsub1 = subscribeLicense(tenant, () => {});
    const unsub2 = subscribeLicense(tenant, () => {});

    unsub1();
    expect(removeChannelSpy.count).toBe(0);

    unsub2();
    expect(removeChannelSpy.count).toBe(1);
  });

  it('tenants diferentes abrem canais distintos', () => {
    const tenantA = 'license-tenant-distinct-a';
    const tenantB = 'license-tenant-distinct-b';
    const unsubA = subscribeLicense(tenantA, () => {});
    const unsubB = subscribeLicense(tenantB, () => {});

    expect(channelSpy.calls).toContain(`license-${tenantA}`);
    expect(channelSpy.calls).toContain(`license-${tenantB}`);

    unsubA();
    unsubB();
  });
});
