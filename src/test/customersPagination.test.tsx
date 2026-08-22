import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer, Order } from '@/types/restaurant';

/**
 * T2.6: a lista de Clientes é local-first (vem toda de uma vez do
 * localStorage), sem paginação nenhuma — uma base de milhares de clientes
 * degradava a página (todos os cards montados de uma vez). Este teste prova
 * que `CustomerGrid` só monta `CUSTOMERS_PAGE_SIZE` (24) cards por página, e
 * que "Seguinte" avança para o resto.
 */

function makeCustomers(n: number): Customer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, name: `Cliente ${String(i).padStart(2, '0')}`, phone: `84000${String(i).padStart(4, '0')}`,
    pointsAdjustment: 0, createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

const CUSTOMERS: Customer[] = makeCustomers(30);
const ORDERS: Order[] = [];

vi.mock('@/lib/store', () => ({
  customerStore: {
    getAll: () => CUSTOMERS,
    remove: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
  },
  orderStore: { getAll: () => ORDERS },
  subscribeOperations: () => () => {},
}));

vi.mock('@/hooks/useLicense', () => ({
  useLicense: () => ({ isBasic: false }),
}));

vi.mock('@/lib/loyaltySettings', () => ({
  getLoyaltySettings: () => ({ enabled: false, pointsPerMT: 0.1, tierBronzeMax: 100, tierSilverMax: 500, allowDiscounts: false, maxDiscountPercent: 0 }),
  saveLoyaltySettings: vi.fn(),
  tierFromPoints: () => 'Bronze' as const,
}));

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', name: 'Ana', role: 'manager', tenantId: 'tenant-1', tenantIds: [] },
      hasPermission: () => true,
      catalogVersion: 1,
    }),
  };
});

async function renderCustomersPage() {
  const { default: CustomersPage } = await import('@/pages/CustomersPage');
  return render(<CustomersPage />);
}

describe('CustomersPage — paginação (30 clientes, página de 24)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('mostra só 24 cartões na primeira página, com indicador "Página 1 de 2"', async () => {
    await renderCustomersPage();
    await screen.findByText('Cliente 00');
    expect(screen.getAllByText(/^Cliente \d\d$/)).toHaveLength(24);
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.queryByText('Cliente 24')).not.toBeInTheDocument();
  });

  it('"Seguinte" mostra o resto dos clientes (6 na 2ª página)', async () => {
    const user = userEvent.setup();
    await renderCustomersPage();
    await screen.findByText('Cliente 00');

    await user.click(screen.getByRole('button', { name: 'Seguinte' }));

    expect(await screen.findByText('Cliente 24')).toBeInTheDocument();
    expect(screen.queryByText('Cliente 00')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Cliente \d\d$/)).toHaveLength(6);
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });

  it('sem paginação quando há 24 ou menos clientes', async () => {
    CUSTOMERS.length = 0;
    CUSTOMERS.push(...makeCustomers(10));
    await renderCustomersPage();
    await screen.findByText('Cliente 00');
    expect(screen.queryByText(/^Página \d de \d$/)).not.toBeInTheDocument();
    CUSTOMERS.length = 0;
    CUSTOMERS.push(...makeCustomers(30));
  });
});
