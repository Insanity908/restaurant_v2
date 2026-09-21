import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bug real (mesma classe do dos pedidos): menuStore.update(), tableStore.update()
 * e inventoryStore.update() geravam o guard de last-write-wins contra o
 * timestamp que a própria escrita ia gravar (`nowIso()` no momento), não
 * contra o valor conhecido antes da edição — por isso o guard quase nunca
 * bloqueava de facto, e quando bloqueava (ex: clock skew) a escrita falhava
 * em silêncio, sem reverter nem avisar ninguém.
 *
 * Agora os três tipos guardam localmente `updatedAt` (capturado do
 * `client_updated_at` da linha no último fetch) e usam ESSE valor no guard,
 * com o mesmo revert-e-avisa de completePayment()/orderStore.update() em
 * caso de rejeição definitiva.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000007';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

const toastErrorMock = vi.fn();
let guardedTable = '';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      insert: () => Promise.resolve({ error: null }),
      upsert: () => Promise.resolve({ error: null }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
      // Guard sempre bloqueado (0 linhas) só para a tabela que o teste está
      // a exercitar — as outras (ex: order_items, chamadas de caminho) só
      // precisam de responder com sucesso vazio.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: () => {
        if (table !== guardedTable) return { eq: () => Promise.resolve({ error: null }) };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          lte: () => delay({ data: [], error: null }, 5),
          lt: () => delay({ data: [], error: null }, 5),
          then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
            delay({ data: [], error: null }, 5).then(resolve),
        };
        return builder;
      },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/storage', () => ({
  warmStorageUrls: vi.fn().mockResolvedValue(undefined),
  MENU_BUCKET: 'menu-images',
}));

vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() } }));

import { menuStore, tableStore, inventoryStore } from '@/lib/store';
import { outboxState } from '@/lib/outbox';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  guardedTable = '';
  toastErrorMock.mockClear();
});

describe('menuStore.update() — guard bloqueado reverte e avisa', () => {
  it('mantém o preço anterior e mostra o aviso quando o servidor rejeita', async () => {
    const created = menuStore.add({ name: 'Pizza', price: 500, category: 'Pratos', available: true });
    await delay(null, 10);
    guardedTable = 'menu_items';

    menuStore.update(created.id, { price: 600 });
    expect(menuStore.getAll()[0].price).toBe(600);
    await delay(null, 60);

    expect(menuStore.getAll()[0].price).toBe(500);
    const op = outboxState().ops.find(o => o.table === 'menu_items' && o.action === 'update');
    expect(op?.failed).toBe(true);
    expect(toastErrorMock).toHaveBeenCalled();
  });
});

describe('tableStore.update() — guard bloqueado reverte e avisa', () => {
  it('mantém o estado anterior da mesa quando o servidor rejeita', async () => {
    const created = tableStore.add({ number: 1, seats: 4, status: 'free' });
    await delay(null, 10);
    guardedTable = 'restaurant_tables';

    tableStore.update(created.id, { status: 'occupied' });
    expect(tableStore.getAll()[0].status).toBe('occupied');
    await delay(null, 60);

    expect(tableStore.getAll()[0].status).toBe('free');
    const op = outboxState().ops.find(o => o.table === 'restaurant_tables' && o.action === 'update');
    expect(op?.failed).toBe(true);
    expect(toastErrorMock).toHaveBeenCalled();
  });
});

describe('inventoryStore.update() — guard bloqueado reverte e avisa', () => {
  it('mantém o stock anterior quando o servidor rejeita', async () => {
    const created = inventoryStore.add({
      name: 'Farinha', unit: 'kg', currentStock: 20, minStock: 5, costPerUnit: 50,
      linkedMenuItemIds: [], usagePerServing: 0.2,
    });
    await delay(null, 10);
    guardedTable = 'inventory_items';

    inventoryStore.update(created.id, { currentStock: 15 });
    expect(inventoryStore.getAll()[0].currentStock).toBe(15);
    await delay(null, 60);

    expect(inventoryStore.getAll()[0].currentStock).toBe(20);
    const op = outboxState().ops.find(o => o.table === 'inventory_items' && o.action === 'update');
    expect(op?.failed).toBe(true);
    expect(toastErrorMock).toHaveBeenCalled();
  });
});
