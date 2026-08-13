import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regressão: cancelar um pedido na Cozinha e o Dashboard continuar a
 * contá-lo como activo.
 *
 * `orderStore.update()` grava localmente (síncrono) e dispara a escrita na
 * nuvem via `cloud('orders').update(...)` em fundo (fire-and-forget). No
 * caminho "online rápido" de `queueWrite`, essa escrita só é registada na
 * fila de saída (`sync_outbox_v1`, o que protege `mergePending()` contra
 * ser pisada) DEPOIS de falhar — enquanto o pedido de rede está em curso,
 * `pendingResourceIds()` não sabe nada sobre ele. Se um `fetchOrders()`
 * concorrente (ex: eco do Realtime, ou montagem de outra página) responder
 * NESSA janela com os dados antigos do servidor (ainda não cancelado),
 * `mergePending()` não tem como saber que a versão local é mais recente e
 * a escrita local é apagada — o pedido "ressuscita" como activo.
 *
 * Este teste usa o `outbox.ts` e `store.ts` reais (só o cliente Supabase é
 * mockado) para reproduzir exactamente essa corrida.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
let updateCallStarted = false;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: () => Promise.resolve({ error: null }),
          // fetchOrders(): select(...).eq(...).order(...).limit(...) — resolve
          // depressa, com os dados ANTIGOS do servidor (ainda não cancelado),
          // para calhar deliberadamente a meio da janela da escrita.
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => delay({
                  data: orderId ? [{
                    id: orderId, tenant_id: TENANT, table_id: null, table_number: null,
                    type: 'takeaway', status: 'active', total: 700, paid: false,
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                    order_items: [], order_events: [],
                  }] : [],
                  error: null,
                }, 5),
              }),
            }),
          }),
          // orderStore.update()'s cloud write: update(...).eq(...).eq(...).lte(...)
          // — demora mais do que o fetch acima, para a janela de corrida real
          // se sobrepor.
          update: () => {
            updateCallStarted = true;
            const builder: any = {
              eq: () => builder,
              lte: () => delay({ data: null, error: null }, 30),
              lt: () => delay({ data: null, error: null }, 30),
              then: (resolve: any) => delay({ data: null, error: null }, 30).then(resolve),
            };
            return builder;
          },
        };
      }
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        insert: () => Promise.resolve({ error: null }),
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

import { orderStore, fetchOrders } from '@/lib/store';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  updateCallStarted = false;
});

describe('corrida entre a escrita optimista de cancelar um pedido e um fetchOrders() concorrente', () => {
  it('o pedido continua cancelado depois de um fetchOrders() responder a meio da escrita', async () => {
    const created = orderStore.add({
      type: 'takeaway', status: 'active', items: [], total: 700, paid: false,
    });
    orderId = created.id;
    // A escrita de criação acima também dispara uma chamada assíncrona —
    // deixa-a assentar antes do cancelamento para isolar a corrida ao update.
    await delay(null, 10);

    // Cancela — dispara a escrita optimista (lenta, 30ms) em fundo. `await`
    // sobre o thenable custom da escrita (PendingWrite) só entrega ao
    // execute()/rede depois de alguns microtasks — dá-lhe essa folga antes
    // de disparar o fetch concorrente, tal como aconteceria com a rede real.
    orderStore.update(orderId, { status: 'cancelled' });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(updateCallStarted).toBe(true);

    // Concorrente: outra página (ex: Dashboard a montar) pede a lista
    // fresca ao servidor a meio da janela — recebe a versão pré-cancelamento.
    await fetchOrders(TENANT);

    // Dá tempo à escrita do cancelamento (30ms) terminar também.
    await delay(null, 50);

    expect(orderStore.getAll().find(o => o.id === orderId)?.status).toBe('cancelled');
  });
});
