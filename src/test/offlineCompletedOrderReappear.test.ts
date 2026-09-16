import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Verificação pedida directamente: um pedido fechado (pago) OFFLINE não pode
 * voltar a aparecer como activo quando o dispositivo reconecta — nem
 * temporariamente (enquanto a escrita ainda está na fila), nem depois de
 * sincronizar (duplicado, ou revertido para por-pagar).
 *
 * `completePayment` já usa `enqueueWrite` (fila-primeiro, nunca tenta a rede
 * primeiro — ver doc comment em outbox.ts) e marca o recurso com
 * `.resource()`, o que `mergePending()` (store.ts) usa para proteger a
 * versão local enquanto a escrita não sincronizou. Este teste prova isso
 * fim-a-fim com o `outbox.ts`/`store.ts` reais (só o cliente Supabase é
 * mockado), não só por leitura de código.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000002';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
// Server-side "verdade" simulada — só muda depois do `update` ser aceite,
// tal como um servidor real só reflecte o pagamento depois de o receber.
let serverPaid = false;
let updateAttempts = 0;
let networkUp = false;

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
                limit: () => Promise.resolve({
                  data: orderId ? [{
                    id: orderId, tenant_id: TENANT, table_id: null, table_number: null,
                    type: 'takeaway', status: 'active', total: 700, paid: serverPaid,
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                    order_items: [], order_events: [],
                  }] : [],
                  error: null,
                }),
              }),
            }),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: () => {
            updateAttempts += 1;
            const resolveCall = () => (networkUp
              ? Promise.resolve({ data: [{ id: orderId }], error: null }).then(r => { serverPaid = true; return r; })
              : delay({ data: null, error: { message: 'Failed to fetch', code: '' } }, 5));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const builder: any = {
              select: () => builder,
              eq: () => builder,
              lte: () => resolveCall(),
              lt: () => resolveCall(),
              then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolveCall().then(resolve),
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
import { flushOutbox, outboxState } from '@/lib/outbox';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  serverPaid = false;
  updateAttempts = 0;
  networkUp = false;
});

describe('pedido fechado offline não reaparece como activo', () => {
  it('mantém "pago" localmente enquanto a fila não sincronizou, mesmo com fetchOrders() concorrente a devolver dados antigos do servidor', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 700, paid: false });
    orderId = created.id;
    await delay(null, 10);

    // Dispositivo offline: completePayment() grava localmente já, e a
    // tentativa de rede (dentro de enqueueWrite -> flushOutbox) falha
    // transitoriamente, ficando na fila.
    const result = await orderStore.completePayment(orderId, { paid: true, status: 'active' });
    expect(result.ok).toBe(true);
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid).toBe(true);
    expect(outboxState().pending).toBe(1);

    // Concorrente: outra página faz fetchOrders() enquanto a escrita ainda
    // está na fila — o servidor ainda não sabe do pagamento (serverPaid=false).
    await fetchOrders(TENANT);
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid)
      .toBe(true); // não "ressuscitou" como por-pagar

    // Ainda offline: mais uma tentativa de flush não muda nada.
    await flushOutbox();
    expect(outboxState().pending).toBe(1);
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid).toBe(true);
  });

  it('depois de reconectar, sincroniza uma única vez (sem duplicar o pedido nem reverter o pagamento)', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 700, paid: false });
    orderId = created.id;
    await delay(null, 10);

    await orderStore.completePayment(orderId, { paid: true, status: 'active' });
    expect(outboxState().pending).toBe(1);
    // `enqueueWrite` já disparou um `flushOutbox()` em fundo (fire-and-forget)
    // que está a meio da tentativa offline (5ms de delay simulado) — dá-lhe
    // tempo de assentar antes de reconectar, senão o `flushOutbox()` explícito
    // a seguir encontra `flushing=true` e devolve-se logo sem fazer nada.
    await delay(null, 20);
    const attemptsWhileOffline = updateAttempts;

    // Reconecta.
    networkUp = true;
    await flushOutbox();

    expect(outboxState().pending).toBe(0); // a operação saiu da fila — sincronizou
    expect(updateAttempts).toBeGreaterThan(attemptsWhileOffline);
    expect(serverPaid).toBe(true); // o servidor recebeu o pagamento — não ficou perdido

    // Um fetchOrders() a seguir, já com o servidor a reflectir o pagamento,
    // continua a mostrar exactamente UM pedido, pago.
    const rows = await fetchOrders(TENANT);
    const matching = rows.filter(o => o.id === orderId);
    expect(matching).toHaveLength(1); // não duplicou
    expect(matching[0].paid).toBe(true); // não reverteu para activo/por-pagar
  });
});
