import { describe, it, expect } from 'vitest';
import { computeCustomerLoyaltyStats } from '@/lib/loyaltyStats';
import { buildCustomerReport } from '@/lib/customerReport';
import type { Customer, Order } from '@/types/restaurant';
import type { LoyaltySettings } from '@/lib/loyaltySettings';

/**
 * T2.10: `CustomersPage.tsx` (cartão/perfil) e `customerReport.ts`
 * (relatório exportável) tinham cada um a sua própria cópia da lógica de
 * pontos/nível — extraída para `computeCustomerLoyaltyStats`. Este teste
 * cobre o núcleo partilhado directamente, e confirma que o relatório
 * (consumidor externo) continua a produzir os mesmos números depois do
 * refactor.
 */

const LOYALTY: LoyaltySettings = {
  enabled: true, pointsPerMT: 0.1, mtPerPoint: 10,
  tierBronzeMax: 100, tierSilverMax: 500, allowDiscounts: true, maxDiscountPercent: 10,
};

function customer(overrides: Partial<Customer> = {}): Customer {
  return { id: 'c1', name: 'Ana', phone: '840001111', pointsAdjustment: 0, createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1', type: 'dine-in', items: [], status: 'completed', createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z', total: 1000, paid: true, ...overrides,
  };
}

describe('computeCustomerLoyaltyStats', () => {
  it('conta só pedidos pagos ligados ao cliente por id OU telefone (normalizado)', () => {
    const c = customer();
    const orders = [
      order({ id: 'o1', customerId: 'c1', total: 1000 }),
      order({ id: 'o2', customerPhone: '84 000 1111', total: 500 }), // mesmo telefone, formatado diferente
      order({ id: 'o3', customerId: 'outro', total: 999 }), // outro cliente
      order({ id: 'o4', customerId: 'c1', total: 700, paid: false }), // não pago
    ];
    const s = computeCustomerLoyaltyStats(c, orders, LOYALTY);
    expect(s.orderCount).toBe(2);
    expect(s.totalSpent).toBe(1500);
  });

  it('pontos = gasto x pointsPerMT, arredondado por baixo, + ajuste manual', () => {
    const c = customer({ pointsAdjustment: 5 });
    const orders = [order({ customerId: 'c1', total: 999 })]; // 999*0.1 = 99.9 -> 99
    const s = computeCustomerLoyaltyStats(c, orders, LOYALTY);
    expect(s.earnedPoints).toBe(99);
    expect(s.points).toBe(104); // 99 + 5
  });

  it('pontos nunca ficam negativos mesmo com um resgate maior que o ganho', () => {
    const c = customer({ pointsAdjustment: -500 });
    const orders = [order({ customerId: 'c1', total: 100 })]; // 10 pontos ganhos
    const s = computeCustomerLoyaltyStats(c, orders, LOYALTY);
    expect(s.points).toBe(0);
  });

  it('fidelidade desactivada: pontos 0 e nível "Bronze" por omissão', () => {
    const c = customer({ pointsAdjustment: 999 });
    const s = computeCustomerLoyaltyStats(c, [order({ customerId: 'c1', total: 100000 })], { ...LOYALTY, enabled: false });
    expect(s.points).toBe(0);
    expect(s.tier).toBe('Bronze');
  });

  it('última visita é a mais recente entre closedAt/updatedAt dos pedidos ligados', () => {
    const c = customer();
    const orders = [
      order({ customerId: 'c1', updatedAt: '2026-08-01T00:00:00.000Z' }),
      order({ customerId: 'c1', closedAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z' }),
    ];
    const s = computeCustomerLoyaltyStats(c, orders, LOYALTY);
    expect(s.lastVisit).toBe('2026-08-15T00:00:00.000Z');
  });

  it('`range` filtra os pedidos considerados (usado pelo relatório) sem afectar a chamada sem range (usada pelo cartão)', () => {
    const c = customer();
    const orders = [
      order({ customerId: 'c1', total: 1000, closedAt: '2026-01-01T00:00:00.000Z' }),
      order({ customerId: 'c1', total: 500, closedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    const all = computeCustomerLoyaltyStats(c, orders, LOYALTY);
    const augOnly = computeCustomerLoyaltyStats(c, orders, LOYALTY, { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-31T23:59:59Z') });
    expect(all.totalSpent).toBe(1500);
    expect(augOnly.totalSpent).toBe(500);
  });
});

describe('buildCustomerReport — usa o mesmo núcleo, mantém o fallback de nível "—"', () => {
  it('cliente com fidelidade desactivada mostra tier "—" (não "Bronze", diferente do cartão)', () => {
    const rows = buildCustomerReport([customer()], [order({ customerId: 'c1', total: 100 })], { loyalty: { ...LOYALTY, enabled: false } });
    expect(rows[0].tier).toBe('—');
    expect(rows[0].points).toBe(0);
  });

  it('respeita o intervalo from/to passado nas opções', () => {
    const orders = [
      order({ id: 'o1', customerId: 'c1', total: 1000, closedAt: '2026-01-01T00:00:00.000Z' }),
      order({ id: 'o2', customerId: 'c1', total: 500, closedAt: '2026-08-10T00:00:00.000Z' }),
    ];
    const rows = buildCustomerReport([customer()], orders, { from: '2026-08-01', to: '2026-08-31', loyalty: LOYALTY });
    expect(rows[0].orderCount).toBe(1);
    expect(rows[0].totalSpent).toBe(500);
  });
});
