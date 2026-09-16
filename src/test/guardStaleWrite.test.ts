import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Bug real reportado: um pagamento já confirmado (cliente já tinha pago)
 * voltou a aparecer como por-pagar ao reentrar no site. Causa: completePayment()
 * usa um guard last-write-wins (`client_updated_at <= valor conhecido pelo
 * dispositivo`) — quando o servidor já tem uma versão mais recente da linha,
 * o `.update()...eq()...lte()` do Postgrest bloqueia a escrita mas devolve
 * SUCESSO (204, sem corpo, sem erro) na mesma. Sem `.select()` a pedir de
 * volta as linhas afetadas, `execute()` não tinha como distinguir "0 linhas
 * porque o guard bloqueou" de "1 linha realmente actualizada" — a operação
 * saía da fila como sincronizada e ninguém era avisado, ficando a
 * confirmação optimista no ecrã enquanto o servidor continuava por-pagar.
 * Ao recarregar, fetchOrders() trazia a verdade do servidor e "desfazia"
 * silenciosamente o pagamento aos olhos de quem estava a usar a app.
 *
 * Este teste simula exactamente esse guard-mismatch (servidor com
 * client_updated_at mais recente do que o dispositivo conhecia) e prova que
 * agora completePayment() reverte o optimista e avisa, em vez de aceitar
 * silenciosamente uma escrita que nunca aconteceu.
 */

const TENANT = 'aaaaaaaa-0000-0000-0000-000000000003';

function delay<T>(v: T, ms: number): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(v), ms));
}

let orderId = '';
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
          // O guard bloqueia sempre aqui (0 linhas) — simula uma versão mais
          // recente já no servidor do que a que o dispositivo tinha.
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

vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() } }));

import { orderStore } from '@/lib/store';
import { outboxState } from '@/lib/outbox';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', TENANT);
  orderId = '';
  toastErrorMock.mockClear();
});

describe('guard bloqueado (servidor com versão mais recente) não passa por sincronizado', () => {
  it('reverte o pagamento optimista e avisa, em vez de sair da fila como sucesso silencioso', async () => {
    const created = orderStore.add({ type: 'takeaway', status: 'active', items: [], total: 700, paid: false });
    orderId = created.id;
    await delay(null, 10);

    const result = await orderStore.completePayment(orderId, { paid: true, status: 'active' });
    expect(result.ok).toBe(true);
    // Optimista: mostra pago de imediato.
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid).toBe(true);

    // Dá tempo à escrita (guard bloqueado, 0 linhas) resolver e ao
    // subscribeOutbox() de completePayment reagir.
    await delay(null, 60);

    // A operação foi marcada como falhada (rejeição permanente), não
    // ficou pendente para sempre nem desapareceu como se tivesse sincronizado.
    const op = outboxState().ops.find(o => o.table === 'orders' && o.label === 'orders.completePayment');
    expect(op?.failed).toBe(true);

    // O optimista foi revertido — volta a mostrar por-pagar, tal como o
    // servidor realmente está, em vez de continuar a mentir ao ecrã.
    expect(orderStore.getAll().find(o => o.id === orderId)?.paid).toBe(false);

    // Staff foi avisado — não é um desfazer silencioso.
    expect(toastErrorMock).toHaveBeenCalled();
  });
});
