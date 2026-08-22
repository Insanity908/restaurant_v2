import type { InventoryItem, Order } from '@/types/restaurant';
import type { PeriodFixedCosts } from './expenses';

/** Dias cobertos por um intervalo; sem intervalo (preset "Tudo"), usa o
 * espaço entre o primeiro e o último pedido pago (mínimo 1 dia). */
export function periodDays(range: { start: Date; end: Date } | null, paidOrders: Order[]): number {
  if (range) return Math.max(1, (range.end.getTime() - range.start.getTime()) / 86_400_000);
  if (!paidOrders.length) return 30;
  const times = paidOrders.map(o => new Date(o.createdAt).getTime());
  return Math.max(1, (Math.max(...times) - Math.min(...times)) / 86_400_000);
}

export const ZERO_FIXED: PeriodFixedCosts = { recurringMonthly: 0, oneTime: 0 };

/**
 * Salários e outras despesas fixas (água, energia, etc.) são valores
 * mensais configurados em /expenses — aqui são distribuídos
 * proporcionalmente aos dias do período (mês de 30 dias como referência).
 * IVA é uma percentagem da receita (assume preços já com IVA incluído).
 */
export function computeStats(paidOrders: Order[], inventory: InventoryItem[], fixedCosts: PeriodFixedCosts, ivaRate: number, days: number) {
  const totalRevenue = paidOrders.reduce((s, o) => s + o.total + (o.tip || 0), 0);
  const totalOrders = paidOrders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  let totalCost = 0;
  paidOrders.forEach(o => {
    o.items.forEach(item => {
      inventory.forEach(inv => {
        if (inv.linkedMenuItemIds.includes(item.menuItemId)) {
          totalCost += inv.costPerUnit * inv.usagePerServing * item.quantity;
        }
      });
    });
  });
  // Recorrentes prorateados pelos dias do período; pontuais entram inteiros
  // (uma compra pontual já aconteceu, não se distribui por meses seguintes).
  const fixedCostsTotal = fixedCosts.recurringMonthly * (days / 30) + fixedCosts.oneTime;
  const ivaAmount = totalRevenue * (ivaRate / 100);
  const profit = totalRevenue - totalCost - fixedCostsTotal - ivaAmount;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  return { totalRevenue, totalOrders, avgTicket, totalCost, fixedCosts: fixedCostsTotal, ivaAmount, profit, margin };
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
