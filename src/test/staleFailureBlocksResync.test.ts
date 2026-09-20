import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bug investigado (screenshots reais do Caixa/POS): depois de um pagamento
 * ser rejeitado por "stale write" (guard bloqueado — servidor tinha versão
 * mais recente), o pedido reverte para por-pagar localmente, como esperado.
 * Mas o op FALHADO fica na fila (`sync_outbox_v1`) até ser retentado/limpo —
 * e `pendingResourceIds()` (outbox.ts) não distingue "ainda a caminho" de
 * "falhou definitivamente": conta ambos como "alteração local por
 * sincronizar". `mergePending()` usa isso para nunca deixar um
 * `fetchOrders()` a seguir pisar a versão local — mas depois de uma falha
 * definitiva já não há alteração local válida para proteger, só o snapshot
 * "previous" a que fizemos rollback. O resultado: esse pedido fica congelado
 * na versão antiga para sempre (nunca mais aceita a verdade do servidor via
 * Realtime/fetchOrders), e cada nova tentativa de "Confirmar Pagamento"
 * repete o guard com o mesmo `previous.updatedAt` desactualizado — falha
 * sempre, em vez de poder ter sucesso depois de o dispositivo apanhar a
 * versão actual.
 *
 * Este teste prova que, depois do rollback, um fetchOrders() que traz a
 * verdade actual do servidor (linha diferente, updated_at mais recente)
 * volta a substituir a versão local (fix: `pendingResourceIds()` já não
 * conta ops falhados como "por sincronizar").
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000004';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
let serverRow: Record<string, unknown> | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: () => Promise.resolve({ error: null }),
          upsert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: serverRow ? [serverRow] : [], error: null }),
              }),
            }),
          }),
          // Guard sempre bloqueado (0 linhas) — mesma simulação de
          // guardStaleWrite.test.ts: servidor já tem versão mais recente.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: () => {
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

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { orderStore, fetchOrders } from '@/lib/store';
import { outboxState } from '@/lib/outbox';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  serverRow = null;
});

describe('op falhado (stale write) já não bloqueia o resync depois do rollback', () => {
  it('fetchOrders() com a verdade actual do servidor substitui o snapshot antigo a que se fez rollback', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 700, paid: false });
    orderId = created.id;
    await delay(null, 10);

    await orderStore.completePayment(orderId, { paid: true, status: 'active' });
    await delay(null, 60);

    const op = outboxState().ops.find(o => o.table === 'orders' && o.label === 'orders.completePayment');
    expect(op?.failed).toBe(true);
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid).toBe(false);

    // A "verdade" do servidor mudou entretanto (ex: outro dispositivo
    // completou o pagamento, ou o servidor simplesmente avançou) —
    // representada por um updated_at mais recente do que tudo o que este
    // dispositivo já viu.
    serverRow = {
      id: orderId, tenant_id: TENANT, table_id: null, table_number: null,
      type: 'takeaway', status: 'completed', total: 700, paid: true,
      created_at: created.createdAt, updated_at: new Date(Date.now() + 60_000).toISOString(),
      order_items: [], order_events: [], order_payments: [],
    };
    await fetchOrders(TENANT);

    const after = orderStore.getAll().find(o => o.id === orderId);
    expect(after?.paid).toBe(true);
    expect(after?.status).toBe('completed');
  });
});
