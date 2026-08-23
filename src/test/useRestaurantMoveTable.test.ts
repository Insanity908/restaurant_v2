import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Table, Order } from '@/types/restaurant';

/**
 * T3.5: mover um pedido para outra mesa não deve obrigar a cancelar e
 * recriar (perdia histórico de eventos/reimpressões). `moveOrderToTable`
 * transfere tableId/tableNumber no pedido e status/currentOrderId nas duas
 * mesas envolvidas. Usa o `useRestaurant.ts` real, só `@/lib/store` e
 * `@/context/AuthContext` são mockados.
 */

let TABLES: Table[] = [];
let ORDERS: Order[] = [];

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Ana', role: 'waiter', tenantId: 't1' }, catalogVersion: 1 }),
}));

vi.mock('@/lib/store', () => ({
  generateId: () => crypto.randomUUID(),
  menuStore: { getAll: () => [] },
  inventoryStore: { getAll: () => [], deductForOrder: vi.fn() },
  customerStore: { getAll: () => [] },
  subscribeOperations: () => () => {},
  subscribeLocalWrites: () => () => {},
  tableStore: {
    getAll: () => TABLES,
    update: (id: string, updates: Partial<Table>) => { TABLES = TABLES.map(t => t.id === id ? { ...t, ...updates } : t); },
  },
  orderStore: {
    getAll: () => ORDERS,
    update: (id: string, updates: Partial<Order>) => { ORDERS = ORDERS.map(o => o.id === id ? { ...o, ...updates } : o); },
    add: vi.fn(),
  },
}));

import { useRestaurant } from '@/hooks/useRestaurant';

function table(overrides: Partial<Table>): Table {
  return { id: 't-1', number: 1, seats: 4, status: 'free', ...overrides };
}
function order(overrides: Partial<Order>): Order {
  return {
    id: 'o-1', type: 'dine-in', items: [], status: 'active', createdAt: '2026-08-22T10:00:00.000Z',
    updatedAt: '2026-08-22T10:00:00.000Z', total: 500, paid: false, ...overrides,
  };
}

beforeEach(() => {
  TABLES = [
    table({ id: 'table-a', number: 1, status: 'occupied', currentOrderId: 'order-1' }),
    table({ id: 'table-b', number: 2, status: 'free' }),
    table({ id: 'table-c', number: 3, status: 'occupied', currentOrderId: 'order-2' }),
  ];
  ORDERS = [order({ id: 'order-1', tableId: 'table-a', tableNumber: 1 })];
});

describe('useRestaurant — moveOrderToTable', () => {
  it('transfere o pedido para a mesa livre: tableId/tableNumber no pedido, status/currentOrderId nas duas mesas', () => {
    const { result } = renderHook(() => useRestaurant());

    act(() => {
      const res = result.current.moveOrderToTable('order-1', 'table-b');
      expect(res.ok).toBe(true);
    });

    const movedOrder = result.current.orders.find(o => o.id === 'order-1');
    expect(movedOrder?.tableId).toBe('table-b');
    expect(movedOrder?.tableNumber).toBe(2);

    const oldTable = result.current.tables.find(t => t.id === 'table-a');
    const newTable = result.current.tables.find(t => t.id === 'table-b');
    expect(oldTable).toMatchObject({ status: 'free', currentOrderId: undefined });
    expect(newTable).toMatchObject({ status: 'occupied', currentOrderId: 'order-1' });
  });

  it('recusa mover para uma mesa que já está ocupada', () => {
    const { result } = renderHook(() => useRestaurant());

    act(() => {
      const res = result.current.moveOrderToTable('order-1', 'table-c');
      expect(res.ok).toBe(false);
    });

    // Nada mudou — nem o pedido nem nenhuma das mesas.
    expect(result.current.orders.find(o => o.id === 'order-1')?.tableId).toBe('table-a');
    expect(result.current.tables.find(t => t.id === 'table-a')?.status).toBe('occupied');
    expect(result.current.tables.find(t => t.id === 'table-c')?.currentOrderId).toBe('order-2');
  });

  it('não faz nada para um pedido inexistente ou sem mesa', () => {
    const { result } = renderHook(() => useRestaurant());
    act(() => {
      const res = result.current.moveOrderToTable('nao-existe', 'table-b');
      expect(res.ok).toBe(false);
    });
    expect(result.current.tables.find(t => t.id === 'table-b')?.status).toBe('free');
  });
});
