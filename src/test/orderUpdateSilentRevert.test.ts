import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bug real reportado: dois pedidos criados offline para o mesmo prato, um
 * marcado para entrega — ao voltar a ficar online, um dos pedidos "foi
 * revertido" (silenciosamente, sem aviso).
 *
 * Causa: `orderStore.update()` — usada por QUALQUER alteração a um pedido
 * existente, não só pagamentos — tinha duas falhas na mesma escrita
 * guardada (last-write-wins):
 *
 * 1. O guard comparava o servidor contra `current.updatedAt` (o timestamp
 *    que a própria escrita ia gravar agora), em vez de `previous.updatedAt`
 *    (o snapshot conhecido ANTES desta edição) — quase nunca bloqueava de
 *    facto, tornando o "last-write-wins" praticamente inofensivo.
 * 2. Quando o guard bloqueava mesmo assim, não havia nenhum mecanismo (ao
 *    contrário de `completePayment()`, ver guardStaleWrite.test.ts) a
 *    vigiar o resultado: a escrita disparava em fundo e era esquecida. A
 *    alteração optimista local ficava a mentir no ecrã até um
 *    `fetchOrders()` mais tarde apagar essa alteração sem aviso — visto na
 *    prática como um pedido "a reverter sozinho".
 *
 * Corrigido: guard contra `previous.updatedAt` + `subscribeOutbox()` a
 * reverter e avisar em caso de rejeição definitiva, mesmo padrão de
 * `completePayment()`.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000005';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
let lastGuardValue: string | null = null;
const toastErrorMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'orders') {
        return {
          insert: () => Promise.resolve({ error: null }),
          upsert: () => Promise.resolve({ error: null }),
          select: () => ({
            eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
          // Guard sempre bloqueado (0 linhas) — mesma simulação de
          // guardStaleWrite.test.ts: servidor já tem versão mais recente.
          // Regista o valor passado ao .lte()/.lt() para o teste do guard.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const builder: any = {
              select: () => builder,
              eq: () => builder,
              lte: (_col: string, v: string) => { lastGuardValue = v; return delay({ data: [], error: null }, 5); },
              lt: (_col: string, v: string) => { lastGuardValue = v; return delay({ data: [], error: null }, 5); },
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

vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() } }));

import { orderStore } from '@/lib/store';
import { outboxState, flushOutbox } from '@/lib/outbox';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  lastGuardValue = null;
  toastErrorMock.mockClear();
  setOnline(true);
});

describe('orderStore.update() — guard contra o snapshot anterior', () => {
  it('usa previous.updatedAt (não o novo timestamp que está a escrever)', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 450, paid: false });
    orderId = created.id;
    await delay(null, 10);
    const previousUpdatedAt = orderStore.getAll().find(o => o.id === orderId)!.updatedAt;

    orderStore.update(orderId, { type: 'delivery' });
    await delay(null, 20);

    expect(lastGuardValue).toBe(previousUpdatedAt);
  });
});

describe('orderStore.update() offline com guard bloqueado ao voltar online (stale write)', () => {
  it('reverte o optimista e avisa quando o servidor rejeita definitivamente — igual a completePayment()', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 450, paid: false });
    orderId = created.id;
    await delay(null, 10);

    // Offline: a alteração fica durabilmente na fila em vez de tentar a rede logo.
    setOnline(false);
    orderStore.update(orderId, { type: 'delivery' });
    expect(orderStore.getAll().find(o => o.id === orderId)?.type).toBe('delivery');
    await delay(null, 20);

    // Volta a ficar online — o guard bloqueia (servidor "já tinha versão
    // mais recente"), simulando o cenário reportado.
    setOnline(true);
    await flushOutbox();
    await delay(null, 20);

    const op = outboxState().ops.find(o => o.table === 'orders' && o.action === 'update');
    expect(op?.failed).toBe(true);

    // Optimista revertido — volta ao tipo anterior, tal como o servidor
    // realmente está, em vez de continuar a mostrar "delivery".
    expect(orderStore.getAll().find(o => o.id === orderId)?.type).toBe('takeaway');
    // Staff foi avisado.
    expect(toastErrorMock).toHaveBeenCalled();
  });
});
