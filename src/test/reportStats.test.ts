import { describe, it, expect } from 'vitest';
import { computeStats, periodDays, pctChange, ZERO_FIXED } from '@/lib/reportStats';
import type { Order, InventoryItem } from '@/types/restaurant';

/**
 * `computeStats`/`periodDays` ganharam `fixedCosts`/`ivaRate`/`days` nesta
 * sessão (lucro líquido em vez de lucro bruto) — a regressão mais importante
 * é que um tenant sem nada configurado em /expenses (fixedCosts = ZERO_FIXED,
 * ivaRate = 0) continue a ver exactamente o `profit` de antes da mudança
 * (totalRevenue - totalCost), sem surpresas.
 */

function order(overrides: Partial<Order> & { items?: Order['items'] }): Order {
  return {
    id: overrides.id ?? 'o1', type: 'dine-in', status: 'completed',
    items: [], total: 0, paid: true,
    createdAt: '2026-01-15T12:00:00.000Z', updatedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function orderItem(overrides: Partial<Order['items'][number]>): Order['items'][number] {
  return {
    id: overrides.id ?? 'i1', menuItemId: overrides.menuItemId ?? 'menu-1', name: 'Item',
    quantity: 1, price: 100, status: 'served',
    ...overrides,
  };
}

function inventoryItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: overrides.id ?? 'inv-1', name: 'Ingrediente', unit: 'kg',
    currentStock: 100, minStock: 1, costPerUnit: 10, linkedMenuItemIds: [], usagePerServing: 1,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('REGRESSÃO: sem despesas fixas nem IVA, o lucro é exactamente receita - custo (comportamento pré-mudança)', () => {
    const orders = [order({ total: 1000, items: [orderItem({ menuItemId: 'menu-1', quantity: 2 })] })];
    const inventory = [inventoryItem({ linkedMenuItemIds: ['menu-1'], costPerUnit: 50, usagePerServing: 1 })];

    const stats = computeStats(orders, inventory, ZERO_FIXED, 0, 30);

    expect(stats.totalCost).toBe(100); // 50 * 1 * 2
    expect(stats.fixedCosts).toBe(0);
    expect(stats.ivaAmount).toBe(0);
    expect(stats.profit).toBe(stats.totalRevenue - stats.totalCost);
    expect(stats.profit).toBe(900);
  });

  it('soma o custo por item sem dupla contagem quando dois itens do pedido partilham o mesmo ingrediente', () => {
    const orders = [order({
      total: 1000,
      items: [
        orderItem({ id: 'i1', menuItemId: 'menu-1', quantity: 2 }),
        orderItem({ id: 'i2', menuItemId: 'menu-2', quantity: 3 }),
      ],
    })];
    // O mesmo ingrediente (farinha) está ligado a AMBOS os itens do menu.
    const inventory = [inventoryItem({ linkedMenuItemIds: ['menu-1', 'menu-2'], costPerUnit: 10, usagePerServing: 1 })];

    const stats = computeStats(orders, inventory, ZERO_FIXED, 0, 30);

    // menu-1: 10*1*2=20; menu-2: 10*1*3=30 — cada item soma o seu próprio custo.
    expect(stats.totalCost).toBe(50);
  });

  it('despesas recorrentes são prorateadas pelos dias do período (mês de referência = 30 dias)', () => {
    const orders = [order({ total: 1000 })];
    const stats = computeStats(orders, [], { recurringMonthly: 3000, oneTime: 0 }, 0, 15);
    expect(stats.fixedCosts).toBe(1500); // 3000 * (15/30)
  });

  it('despesas pontuais entram inteiras, independentemente da duração do período', () => {
    const orders = [order({ total: 1000 })];
    const stats = computeStats(orders, [], { recurringMonthly: 0, oneTime: 5000 }, 0, 5);
    expect(stats.fixedCosts).toBe(5000);
  });

  it('IVA é uma percentagem da receita bruta (não do lucro)', () => {
    const orders = [order({ total: 10000 })];
    const stats = computeStats(orders, [], ZERO_FIXED, 17, 30);
    expect(stats.ivaAmount).toBeCloseTo(1700);
    expect(stats.profit).toBeCloseTo(10000 - 1700);
  });

  it('lucro líquido = receita - custo - despesas fixas prorateadas - IVA, todos combinados', () => {
    const orders = [order({ total: 10000, items: [orderItem({ menuItemId: 'menu-1', quantity: 1 })] })];
    const inventory = [inventoryItem({ linkedMenuItemIds: ['menu-1'], costPerUnit: 1000, usagePerServing: 1 })];
    const stats = computeStats(orders, inventory, { recurringMonthly: 3000, oneTime: 500 }, 10, 30);
    // custo=1000, despesas=3000+500=3500, iva=10%*10000=1000
    expect(stats.profit).toBe(10000 - 1000 - 3500 - 1000);
  });

  it('margem é 0 (não NaN/Infinity) quando não há receita', () => {
    const stats = computeStats([], [], ZERO_FIXED, 0, 30);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.margin).toBe(0);
    expect(stats.avgTicket).toBe(0);
  });

  it('gorjeta soma-se à receita mas não ao ticket médio de itens', () => {
    const orders = [order({ total: 1000, tip: 100 })];
    const stats = computeStats(orders, [], ZERO_FIXED, 0, 30);
    expect(stats.totalRevenue).toBe(1100);
  });
});

describe('periodDays', () => {
  it('com intervalo explícito: diferença em dias entre start/end', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-11T00:00:00.000Z');
    expect(periodDays({ start, end }, [])).toBe(10);
  });

  it('intervalo com menos de 1 dia é arredondado para o mínimo de 1', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T01:00:00.000Z');
    expect(periodDays({ start, end }, [])).toBe(1);
  });

  it('sem intervalo (preset "Tudo") e sem nenhum pedido pago: cai no fallback fixo de 30 dias', () => {
    expect(periodDays(null, [])).toBe(30);
  });

  it('sem intervalo, usa o espaço entre o primeiro e o último pedido pago', () => {
    const orders = [
      order({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
      order({ id: 'b', createdAt: '2026-01-06T00:00:00.000Z' }),
    ];
    expect(periodDays(null, orders)).toBe(5);
  });

  it('sem intervalo e um único pedido pago: mínimo de 1 dia (não 0)', () => {
    const orders = [order({ createdAt: '2026-01-01T00:00:00.000Z' })];
    expect(periodDays(null, orders)).toBe(1);
  });
});

describe('pctChange', () => {
  it('período anterior sem receita e período actual também sem receita: 0% (não null/NaN)', () => {
    expect(pctChange(0, 0)).toBe(0);
  });

  it('período anterior sem receita mas o actual tem: null (variação indefinida, não Infinity)', () => {
    expect(pctChange(500, 0)).toBeNull();
  });

  it('caso normal: percentagem de variação relativa ao período anterior', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
  });
});
