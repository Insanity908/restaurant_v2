import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Order, OrderItem, OrderPayment } from '@/types/restaurant';

/**
 * T4.1: dividir conta / pagamento parcial. `addPartialPayment` só regista
 * a parcela — não mexe em paid/total/status do pedido (isso continua a
 * acontecer só quando `completeOrder`, inalterado, fecha o pedido). Usa o
 * `useRestaurant.ts` real, só `@/lib/store` e `@/context/AuthContext` são
 * mockados.
 */

let ORDERS: Order[] = [];

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Ana', role: 'cashier', tenantId: 't1' }, catalogVersion: 1 }),
}));

vi.mock('@/lib/store', () => ({
  generateId: () => crypto.randomUUID(),
  menuStore: { getAll: () => [] },
  tableStore: { getAll: () => [], update: vi.fn() },
  inventoryStore: { getAll: () => [], deductForOrder: vi.fn() },
  customerStore: { getAll: () => [], update: vi.fn() },
  subscribeOperations: () => () => {},
  orderStore: {
    getAll: () => ORDERS,
    update: (id: string, updates: Partial<Order>) => { ORDERS = ORDERS.map(o => o.id === id ? { ...o, ...updates } : o); },
    addPayment: (id: string, payment: OrderPayment) => {
      ORDERS = ORDERS.map(o => o.id === id ? { ...o, payments: [...(o.payments ?? []), payment] } : o);
    },
    removeLastPayment: (id: string) => {
      ORDERS = ORDERS.map(o => o.id === id ? { ...o, payments: (o.payments ?? []).slice(0, -1) } : o);
    },
    completePayment: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { useRestaurant } from '@/hooks/useRestaurant';

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return { id: 'item-1', menuItemId: 'menu-1', name: 'Frango', quantity: 1, price: 700, status: 'served', ...overrides };
}
function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1', type: 'dine-in', items: [item()], status: 'active', createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z', total: 700, paid: false, ...overrides,
  };
}

beforeEach(() => { ORDERS = [order()]; });

describe('useRestaurant — addPartialPayment', () => {
  it('regista a parcela sem mexer em paid/status do pedido', () => {
    const { result } = renderHook(() => useRestaurant());

    act(() => {
      const res = result.current.addPartialPayment('order-1', 'cash', 300, 700);
      expect(res).toMatchObject({ ok: true, remaining: 400 });
    });

    const o = result.current.orders.find(x => x.id === 'order-1');
    expect(o?.payments).toHaveLength(1);
    expect(o?.payments?.[0]).toMatchObject({ method: 'cash', amount: 300 });
    expect(o?.paid).toBe(false);
    expect(o?.status).toBe('active');
  });

  it('soma parcelas de métodos diferentes e devolve remaining correcto', () => {
    const { result } = renderHook(() => useRestaurant());

    act(() => { result.current.addPartialPayment('order-1', 'cash', 300, 700); });
    let res2: ReturnType<typeof result.current.addPartialPayment> | undefined;
    act(() => { res2 = result.current.addPartialPayment('order-1', 'card', 400, 700); });

    expect(res2).toMatchObject({ ok: true, remaining: 0 });
    const o = result.current.orders.find(x => x.id === 'order-1');
    expect(o?.payments?.map(p => p.method)).toEqual(['cash', 'card']);
  });

  it('recusa um valor maior do que o em falta', () => {
    const { result } = renderHook(() => useRestaurant());
    act(() => { result.current.addPartialPayment('order-1', 'cash', 300, 700); });

    let res: ReturnType<typeof result.current.addPartialPayment> | undefined;
    act(() => { res = result.current.addPartialPayment('order-1', 'cash', 500, 700); });

    expect(res?.ok).toBe(false);
    const o = result.current.orders.find(x => x.id === 'order-1');
    expect(o?.payments).toHaveLength(1); // a segunda tentativa não foi registada
  });

  it('recusa valores <= 0', () => {
    const { result } = renderHook(() => useRestaurant());
    let res: ReturnType<typeof result.current.addPartialPayment> | undefined;
    act(() => { res = result.current.addPartialPayment('order-1', 'cash', 0, 700); });
    expect(res?.ok).toBe(false);
  });

  it('recusa pagamentos parciais com pratos por servir (mesma regra de completeOrder)', () => {
    ORDERS = [order({ items: [item({ status: 'pending' })] })];
    const { result } = renderHook(() => useRestaurant());
    let res: ReturnType<typeof result.current.addPartialPayment> | undefined;
    act(() => { res = result.current.addPartialPayment('order-1', 'cash', 300, 700); });
    expect(res?.ok).toBe(false);
  });

  it('recusa novas parcelas depois do pedido já estar pago', () => {
    ORDERS = [order({ paid: true, status: 'completed' })];
    const { result } = renderHook(() => useRestaurant());
    let res: ReturnType<typeof result.current.addPartialPayment> | undefined;
    act(() => { res = result.current.addPartialPayment('order-1', 'cash', 100, 700); });
    expect(res?.ok).toBe(false);
  });
});

describe('useRestaurant — removeLastPayment', () => {
  it('remove só a parcela mais recente', () => {
    const { result } = renderHook(() => useRestaurant());
    act(() => { result.current.addPartialPayment('order-1', 'cash', 300, 700); });
    act(() => { result.current.addPartialPayment('order-1', 'card', 100, 700); });

    act(() => { result.current.removeLastPayment('order-1'); });

    const o = result.current.orders.find(x => x.id === 'order-1');
    expect(o?.payments).toHaveLength(1);
    expect(o?.payments?.[0].method).toBe('cash');
  });
});
