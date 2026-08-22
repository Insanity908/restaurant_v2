/**
 * Núcleo partilhado do cálculo de fidelidade de um cliente — que pedidos
 * pagos lhe pertencem (por id ou telefone), total gasto, última visita,
 * pontos ganhos e nível. Extraído porque `CustomersPage.tsx` (cartão/perfil
 * do cliente) e `customerReport.ts` (relatório exportável) tinham cada um a
 * sua própria cópia desta lógica — o mesmo risco que motivou o refactor de
 * `reportStats.ts` para Relatórios: as duas cópias podiam divergir sem
 * ninguém notar (ex.: mudar a fórmula de pontos num sítio e esquecer o outro).
 */
import { Customer, Order } from '@/types/restaurant';
import { LoyaltySettings, tierFromPoints } from './loyaltySettings';

export interface LoyaltyStatsRange {
  from?: Date;
  to?: Date;
}

export interface CustomerLoyaltyStats {
  matchedOrders: Order[];
  orderCount: number;
  totalSpent: number;
  lastVisit?: string;
  earnedPoints: number;
  points: number;
  /** Nível quando a fidelidade está activa; 'Bronze' por omissão quando desactivada
   *  (quem quiser um rótulo diferente para "desactivado", ex. '—', decide na camada de apresentação). */
  tier: 'Bronze' | 'Prata' | 'Ouro';
}

/** `range` filtra os pedidos considerados por data (usado pelo relatório
 *  exportável); omitido, considera o histórico completo do cliente (usado
 *  pelo cartão/perfil, que mostra sempre o total desde sempre). */
export function computeCustomerLoyaltyStats(
  customer: Customer,
  orders: Order[],
  loyalty: LoyaltySettings,
  range?: LoyaltyStatsRange,
): CustomerLoyaltyStats {
  const norm = customer.phone.replace(/\D/g, '');
  const matchedOrders = orders.filter(o => {
    if (!o.paid) return false;
    const belongs = o.customerId === customer.id || (norm && o.customerPhone?.replace(/\D/g, '') === norm);
    if (!belongs) return false;
    if (!range) return true;
    const when = o.closedAt || o.updatedAt;
    if (!when) return false;
    const t = new Date(when).getTime();
    if (range.from && t < range.from.getTime()) return false;
    if (range.to && t > range.to.getTime()) return false;
    return true;
  });

  const totalSpent = matchedOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const lastVisit = matchedOrders
    .map(o => o.closedAt || o.updatedAt)
    .sort()
    .reverse()[0];
  const earnedPoints = loyalty.enabled ? Math.floor(totalSpent * loyalty.pointsPerMT) : 0;
  const points = loyalty.enabled ? Math.max(0, earnedPoints + (customer.pointsAdjustment || 0)) : 0;
  const tier: CustomerLoyaltyStats['tier'] = loyalty.enabled ? tierFromPoints(points, loyalty) : 'Bronze';

  return { matchedOrders, orderCount: matchedOrders.length, totalSpent, lastVisit, earnedPoints, points, tier };
}
