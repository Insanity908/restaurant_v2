import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer, Order } from '@/types/restaurant';

/**
 * T2.7: ajustes manuais de pontos (bónus/resgate) ficam registados com
 * quem/quando/quanto, visíveis no perfil do cliente — antes só mudavam
 * `pointsAdjustment` sem deixar rasto nenhum.
 */

const recordMock = vi.fn();
const fetchMock = vi.fn().mockResolvedValue([]);

const CUSTOMER: Customer = {
  id: 'c1', name: 'Ana', phone: '840001111', pointsAdjustment: 0, createdAt: '2026-01-01T00:00:00.000Z',
};
const ORDERS: Order[] = [];

// Precisa de mutar `CUSTOMER` de verdade (não só registar a chamada) — o
// teste de resgate depende de `stats.points` reflectir o bónus anterior, e
// isso só acontece se o "update" simulado persistir no objecto que
// `getAll()` continua a devolver.
const updateMock = vi.fn((id: string, updates: Partial<Customer>) => {
  if (id === CUSTOMER.id) Object.assign(CUSTOMER, updates);
});

vi.mock('@/lib/store', () => ({
  customerStore: { getAll: () => [CUSTOMER], remove: vi.fn(), update: updateMock, add: vi.fn() },
  orderStore: { getAll: () => ORDERS },
  subscribeOperations: () => () => {},
}));

vi.mock('@/hooks/useLicense', () => ({ useLicense: () => ({ isBasic: false }) }));

vi.mock('@/lib/loyaltySettings', () => ({
  getLoyaltySettings: () => ({ enabled: true, pointsPerMT: 0.1, tierBronzeMax: 100, tierSilverMax: 500, allowDiscounts: true, maxDiscountPercent: 10 }),
  saveLoyaltySettings: vi.fn(),
  tierFromPoints: () => 'Bronze' as const,
}));

vi.mock('@/lib/loyaltyHistory', () => ({
  recordLoyaltyAdjustment: recordMock,
  fetchLoyaltyHistory: fetchMock,
}));

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', name: 'Gerente Ana', role: 'manager', tenantId: 'tenant-1', tenantIds: [] },
      hasPermission: () => true,
      catalogVersion: 1,
    }),
  };
});

async function renderCustomersPage() {
  const { default: CustomersPage } = await import('@/pages/CustomersPage');
  return render(<CustomersPage />);
}

describe('CustomersPage — histórico de ajustes de fidelidade', () => {
  beforeEach(() => {
    vi.resetModules();
    recordMock.mockReset();
    fetchMock.mockReset().mockResolvedValue([]);
    updateMock.mockClear();
    CUSTOMER.pointsAdjustment = 0;
  });

  it('carrega o histórico existente ao abrir o perfil do cliente', async () => {
    fetchMock.mockResolvedValue([
      { id: 'h1', customerId: 'c1', delta: 50, reason: 'Bónus manual', createdByName: 'Gerente Ana', createdAt: '2026-08-01T10:00:00.000Z' },
    ]);
    const user = userEvent.setup();
    await renderCustomersPage();
    await user.click(await screen.findByText('Ana'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText(/Bónus manual · Gerente Ana/)).toBeInTheDocument();
  });

  it('"+10 bónus" regista o ajuste (quem/quanto/porquê) e mostra-o de imediato no histórico', async () => {
    const user = userEvent.setup();
    await renderCustomersPage();
    await user.click(await screen.findByText('Ana'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '+10 bónus' }));

    expect(recordMock).toHaveBeenCalledWith('c1', 10, 'Bónus manual', 'Gerente Ana');
    expect(await screen.findByText(/Bónus manual · Gerente Ana/)).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
  });

  it('resgate regista um delta negativo', async () => {
    const user = userEvent.setup();
    await renderCustomersPage();
    await user.click(await screen.findByText('Ana'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: '+50 bónus' }));
    recordMock.mockClear();

    await user.type(screen.getByPlaceholderText('0'), '20');
    await user.click(screen.getByRole('button', { name: 'Resgatar' }));

    expect(recordMock).toHaveBeenCalledWith('c1', -20, 'Resgate de pontos', 'Gerente Ana');
    expect(await screen.findByText('-20')).toBeInTheDocument();
  });
});
