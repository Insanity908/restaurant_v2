import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Order } from '@/types/restaurant';

/**
 * REGRESSÃO: `orders` (useRestaurant) é a cache local ao vivo, capada aos
 * 500 pedidos mais recentes do tenant (ver fetchOrders em store.ts). A vista
 * por omissão de Relatórios é "Todo o período" — sem esta correção, um
 * restaurante com mais de 500 pedidos pagos no total mostrava receita/
 * contagens subestimadas sem qualquer aviso, porque os pedidos mais antigos
 * simplesmente não estavam na cache. A correção: quando a cache parece
 * truncada (tem exactamente 500 linhas) e o intervalo pedido começa antes do
 * pedido mais antigo ainda presente, ReportsPage vai buscar o intervalo
 * completo ao servidor via fetchOrdersInRange (o mesmo caminho sem limite
 * que "Arquivo de Dados" já usa) em vez de confiar só na cache local.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchOrdersInRangeMock = vi.fn();
vi.mock('@/lib/dataArchive', () => ({
  fetchOrdersInRange: (...args: unknown[]) => fetchOrdersInRangeMock(...args),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', tenantId: 'tenant-1', name: 'Admin', role: 'admin' }, hasPermission: () => true }),
}));

vi.mock('@/lib/store', () => ({
  staffStore: { getAll: () => [] },
  shiftStore: { getAll: () => [] },
}));

function order(overrides: Partial<Order> & { items?: Order['items'] }): Order {
  return {
    id: overrides.id ?? 'o1', type: 'dine-in', status: 'completed',
    items: [], total: 100, paid: true,
    createdAt: '2026-01-15T12:00:00.000Z', updatedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

// 500 pedidos recentes espalhados pelos últimos ~10 dias — exactamente o
// tamanho da cache capada, simulando um tenant que a atingiu.
function cappedRecentOrders(): Order[] {
  const now = Date.now();
  return Array.from({ length: 500 }, (_, i) => order({
    id: `recent-${i}`,
    createdAt: new Date(now - i * 30 * 60 * 1000).toISOString(), // um a cada 30min
  }));
}

async function renderReports(orders: Order[]) {
  vi.doMock('@/hooks/useRestaurant', () => ({
    useRestaurant: () => ({ orders, inventory: [], menuItems: [] }),
  }));
  const { default: ReportsPage } = await import('@/pages/ReportsPage');
  return render(<MemoryRouter><ReportsPage /></MemoryRouter>);
}

// "Pedidos Pagos" é um KpiCard onde o rótulo e o valor são elementos irmãos
// — o valor por si só ("3", "500", "501"...) não é único na página (aparece
// também em badges/legendas), por isso navega a partir do rótulo em vez de
// procurar o número directamente.
async function paidOrdersCount(): Promise<string> {
  const label = await screen.findByText('Pedidos Pagos');
  const value = label.parentElement?.nextElementSibling;
  return value?.textContent ?? '';
}

beforeEach(() => {
  vi.resetModules();
  fetchOrdersInRangeMock.mockReset();
});

describe('ReportsPage — cache local capada a 500 pedidos', () => {
  it('cache com menos de 500 pedidos: nunca vai buscar o intervalo completo ao servidor', async () => {
    const orders = [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })];
    await renderReports(orders);

    expect(await paidOrdersCount()).toBe('3');
    expect(fetchOrdersInRangeMock).not.toHaveBeenCalled();
  });

  it('cache com exactamente 500 pedidos (potencialmente truncada): busca o intervalo completo e usa esse resultado, não só a cache local', async () => {
    const localOrders = cappedRecentOrders();
    // O servidor devolve os 500 recentes MAIS um pedido pago com quase um
    // ano — só existe na resposta do fetch de intervalo completo, nunca na
    // cache local capada.
    const fullRange = [...localOrders, order({ id: 'old-one', createdAt: '2025-02-01T12:00:00.000Z' })];
    fetchOrdersInRangeMock.mockResolvedValue(fullRange);

    await renderReports(localOrders);

    await waitFor(() => expect(fetchOrdersInRangeMock).toHaveBeenCalledTimes(1));
    expect(fetchOrdersInRangeMock).toHaveBeenCalledWith('tenant-1', expect.any(Date), expect.any(Date));

    // Sem a correcção, isto ficaria em "500" (só a cache local).
    expect(await paidOrdersCount()).toBe('501');
  });

  it('falha ao buscar o intervalo completo: cai de volta para a cache local em vez de rebentar', async () => {
    const localOrders = cappedRecentOrders();
    fetchOrdersInRangeMock.mockRejectedValue(new Error('network down'));

    await renderReports(localOrders);

    await waitFor(() => expect(fetchOrdersInRangeMock).toHaveBeenCalledTimes(1));
    expect(await paidOrdersCount()).toBe('500');
  });
});
