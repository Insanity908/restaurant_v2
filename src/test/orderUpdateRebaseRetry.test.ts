import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bug real reportado ao vivo (mesa com 11 itens, jsetra.com/pos): a cozinha
 * a marcar itens servidos e o caixa a acrescentar rondas à mesma conta ao
 * mesmo tempo faziam a escrita de um lado ser rejeitada (guard bloqueado —
 * "stale write") e revertida, repetidamente, dando a sensação de que a
 * fila de sincronização nunca ficava limpa (uma nova falha aparecia
 * segundos depois de "Limpar fila").
 *
 * orderStore.update() aceita agora um `rebase` opcional: em vez de
 * desistir e reverter logo no primeiro guard bloqueado, busca a versão
 * actual do servidor e volta a aplicar SÓ a própria alteração (marcar
 * este item / acrescentar estes itens) em cima dela. Este teste prova que
 * isso resolve o caso real — duas edições concorrentes a partes
 * diferentes do mesmo pedido — sem reverter nenhuma das duas.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000006';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
let updateCallCount = 0;
let alwaysBlocked = false;
let freshRow: Record<string, unknown> | null = null;
const toastErrorMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: () => Promise.resolve({ error: null }),
          upsert: () => Promise.resolve({ error: null }),
          // Leitura fresca (fetchOrderById, usada só pelo rebase).
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: freshRow, error: null }),
              }),
            }),
          }),
          // 1ª chamada: guard bloqueado (0 linhas) — simula a versão do
          // servidor já ter avançado (a outra edição concorrente).
          // 2ª chamada (retentativa depois do rebase): sucesso.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: () => {
            updateCallCount += 1;
            const blocked = alwaysBlocked || updateCallCount === 1;
            const result = blocked ? { data: [], error: null } : { data: [{ id: orderId }], error: null };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const builder: any = {
              select: () => builder,
              eq: () => builder,
              lte: () => delay(result, 5),
              lt: () => delay(result, 5),
              then: (resolve: (v: typeof result) => void) => delay(result, 5).then(resolve),
            };
            return builder;
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        insert: () => Promise.resolve({ error: null }),
        upsert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    },
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

import { orderStore } from '@/lib/store';
import { outboxState } from '@/lib/outbox';
import type { Order } from '@/types/restaurant';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  updateCallCount = 0;
  alwaysBlocked = false;
  freshRow = null;
  toastErrorMock.mockClear();
});

describe('orderStore.update() com rebase — conflito concorrente entre cozinha e caixa', () => {
  it('em vez de reverter, busca a versão actual e volta a aplicar só a própria alteração — nenhuma das duas edições se perde', async () => {
    const created = orderStore.add({
      type: 'dine-in', status: 'active', paid: false, total: 100,
      items: [{ id: 'item-1', menuItemId: 'm1', name: 'Pizza', price: 100, quantity: 1, status: 'pending' }],
    });
    orderId = created.id;
    await delay(null, 10);

    // Entretanto, "concorrentemente", o caixa acrescentou uma ronda —
    // é isto que o fetch fresco (fetchOrderById) vai devolver.
    const concurrentItem = { id: 'item-2', menu_item_id: 'm2', name: 'Coca', price: 25, quantity: 1, status: 'pending' };
    freshRow = {
      id: orderId, tenant_id: TENANT, table_id: null, table_number: null,
      type: 'dine-in', status: 'active', total: 125, paid: false,
      created_at: created.createdAt, updated_at: new Date(Date.now() + 60_000).toISOString(),
      order_items: [
        { id: 'item-1', menu_item_id: 'm1', name: 'Pizza', price: 100, quantity: 1, status: 'pending' },
        concurrentItem,
      ],
      order_events: [], order_payments: [],
    };

    // A cozinha marca item-1 como servido — mesma forma como
    // updateOrderItemStatus() chamaria isto.
    const updatedItems = created.items.map(i => i.id === 'item-1' ? { ...i, status: 'served' as const } : i);
    orderStore.update(orderId, { items: updatedItems, status: 'ready' }, (fresh: Order) => {
      const rebasedItems = fresh.items.map(i => i.id === 'item-1' ? { ...i, status: 'served' as const } : i);
      return {
        items: rebasedItems,
        status: rebasedItems.every(i => i.status === 'ready' || i.status === 'served') ? 'ready' : 'preparing',
      };
    });

    await delay(null, 80);

    expect(updateCallCount).toBe(2); // 1ª bloqueada + retentativa depois do rebase
    const finalOrder = orderStore.getAll().find(o => o.id === orderId)!;

    // O item marcado pela cozinha ficou servido...
    expect(finalOrder.items.find(i => i.id === 'item-1')?.status).toBe('served');
    // ...E a ronda que o caixa tinha acrescentado concorrentemente não
    // desapareceu (não foi um revert a apagar a edição da outra pessoa).
    expect(finalOrder.items.find(i => i.id === 'item-2')).toBeTruthy();

    // Sem falha na fila, sem aviso de "revertido" — o conflito resolveu-se sozinho.
    expect(outboxState().failed).toBe(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('se o rebase também colidir repetidamente, desiste ao fim de MAX_REBASE_ATTEMPTS e reverte/avisa como antes', async () => {
    const created = orderStore.add({
      type: 'takeaway', status: 'active', paid: false, total: 100,
      items: [{ id: 'item-1', menuItemId: 'm1', name: 'Pizza', price: 100, quantity: 1, status: 'pending' }],
    });
    orderId = created.id;
    await delay(null, 10);

    // O update() nunca deixa de estar bloqueado — simula um conflito que
    // o rebase também não consegue resolver (ex: outra escrita a mudar a
    // mesma coisa continuamente).
    alwaysBlocked = true;
    freshRow = {
      id: orderId, tenant_id: TENANT, table_id: null, table_number: null,
      type: 'takeaway', status: 'active', total: 100, paid: false,
      created_at: created.createdAt, updated_at: new Date(Date.now() + 60_000).toISOString(),
      order_items: created.items.map(i => ({ id: i.id, menu_item_id: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity, status: i.status })),
      order_events: [], order_payments: [],
    };

    orderStore.update(orderId, { status: 'preparing' }, (fresh: Order) => ({ status: fresh.status }));

    await delay(null, 150);

    // 1ª tentativa + MAX_REBASE_ATTEMPTS retentativas, todas bloqueadas.
    expect(updateCallCount).toBe(3);
    expect(toastErrorMock).toHaveBeenCalled();
    const op = outboxState().ops.find(o => o.table === 'orders' && o.action === 'update');
    expect(op?.failed).toBe(true);
  });
});
