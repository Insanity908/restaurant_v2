import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * AppSidebar ganhou nesta sessão: (1) um badge de pedidos pendentes
 * (`pendingConfirmationOrders`, vindos do QR/entrega do cliente) no ícone de
 * "Mesas", e (2) uma imagem de fundo aplicada directamente a `document.body`
 * (efeito colateral fora da árvore React, com cleanup no unmount). Ambos são
 * fáceis de quebrar silenciosamente num refactor futuro sem nenhum teste.
 */

const mockPendingOrders: { length: number } = { length: 0 };
let mockBackgroundImageUrl: string | undefined;
let mockRole: 'waiter' | 'manager' | 'superadmin' = 'waiter';
let mockSuperAdminAlerts = 0;

vi.mock('@/hooks/useSuperAdminAlerts', () => ({
  useSuperAdminAlerts: () => mockSuperAdminAlerts,
}));

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      brandName: 'Restaurante de Teste', iconEmoji: '☕', iconUrl: undefined,
      backgroundImageUrl: mockBackgroundImageUrl,
    },
    update: vi.fn(), reset: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLicense', () => ({
  useLicense: () => ({ tenant: null, status: null, daysLeft: 0, isBasic: false }),
}));

vi.mock('@/hooks/useRestaurant', () => ({
  useRestaurant: () => ({
    // `.length` é tudo o que AppSidebar lê (`pendingOrdersCount = pendingConfirmationOrders.length`).
    pendingConfirmationOrders: Array.from({ length: mockPendingOrders.length }),
  }),
}));

vi.mock('@/lib/tenants', () => ({
  tenantStore: { getAll: () => [], current: () => null },
}));

vi.mock('@/components/InstallAppButton', () => ({ default: () => null }));
vi.mock('@/components/RestaurantSwitcherDialog', () => ({ default: () => null }));
vi.mock('@/components/FeedbackDialog', () => ({ default: () => null }));

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useOptionalAuth: () => ({
      user: { id: 'u1', name: 'Ana', role: mockRole, tenantId: 'tenant-1', tenantIds: [] },
      logout: vi.fn(),
      switchTenant: vi.fn(),
    }),
  };
});

async function renderSidebar() {
  const { default: AppSidebar } = await import('@/components/AppSidebar');
  return render(<MemoryRouter><AppSidebar /></MemoryRouter>);
}

describe('AppSidebar — badge de pedidos pendentes', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPendingOrders.length = 0;
    mockBackgroundImageUrl = undefined;
    mockRole = 'waiter';
  });

  it('sem pedidos pendentes, nenhum badge é mostrado no ícone de Mesas', async () => {
    mockPendingOrders.length = 0;
    const { container } = await renderSidebar();
    expect(container.querySelectorAll('.bg-destructive')).toHaveLength(0);
  });

  it('com pedidos pendentes (≤9), mostra a contagem exacta em ambas as variantes (desktop + mobile)', async () => {
    mockPendingOrders.length = 3;
    const { container } = await renderSidebar();
    // O item desktop de '/tables' renderiza DOIS badges (ícone + rótulo —
    // `hidden lg:flex` é só CSS, o jsdom não remove o nó do DOM por causa
    // disso), mais UM no item da barra mobile (só ícone, sem rótulo) = 3.
    const badges = container.querySelectorAll('.bg-destructive');
    expect(badges).toHaveLength(3);
    badges.forEach(b => expect(b.textContent).toBe('3'));
  });

  it('com mais de 9 pedidos pendentes, mostra "9+" em vez do número exacto', async () => {
    mockPendingOrders.length = 12;
    const { container } = await renderSidebar();
    const badges = container.querySelectorAll('.bg-destructive');
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach(b => expect(b.textContent).toBe('9+'));
  });
});

describe('AppSidebar — badge de alertas do superadmin (T3.2)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPendingOrders.length = 0;
    mockBackgroundImageUrl = undefined;
    mockRole = 'superadmin';
    mockSuperAdminAlerts = 0;
  });

  it('sem novidades, o ícone "Super Admin" não mostra badge', async () => {
    mockSuperAdminAlerts = 0;
    const { container } = await renderSidebar();
    expect(container.querySelectorAll('.bg-destructive')).toHaveLength(0);
  });

  it('com comprovativos/feedback novos, mostra a contagem no ícone "Super Admin"', async () => {
    mockSuperAdminAlerts = 4;
    const { container } = await renderSidebar();
    // Item desktop do '/admin' renderiza dois badges (ícone + rótulo, ver
    // nota equivalente no teste de pedidos pendentes acima).
    const badges = container.querySelectorAll('.bg-destructive');
    expect(badges).toHaveLength(2);
    badges.forEach(b => expect(b.textContent).toBe('4'));
  });
});

describe('AppSidebar — imagem de fundo da aplicação', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPendingOrders.length = 0;
    mockBackgroundImageUrl = undefined;
    document.body.style.backgroundImage = '';
  });

  it('com backgroundImageUrl configurado, aplica-o a document.body', async () => {
    mockBackgroundImageUrl = 'https://example.com/fundo.jpg';
    await renderSidebar();
    expect(document.body.style.backgroundImage).toContain('fundo.jpg');
  });

  it('sem backgroundImageUrl, document.body fica sem imagem de fundo', async () => {
    mockBackgroundImageUrl = undefined;
    await renderSidebar();
    expect(document.body.style.backgroundImage).toBe('');
  });

  it('ao desmontar, remove a imagem de fundo de document.body (cleanup) — evita sujar o próximo render', async () => {
    mockBackgroundImageUrl = 'https://example.com/fundo.jpg';
    const { unmount } = await renderSidebar();
    expect(document.body.style.backgroundImage).toContain('fundo.jpg');
    unmount();
    expect(document.body.style.backgroundImage).toBe('');
  });
});

describe('AppSidebar — rótulo da equipa', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPendingOrders.length = 0;
    mockBackgroundImageUrl = undefined;
    mockRole = 'manager'; // '/staff' não está em ROUTE_PERMISSIONS para 'waiter'
  });

  it('o item de navegação para /staff mostra "Team e Despesas", não "Funcionários"', async () => {
    await renderSidebar();
    expect(screen.getByText('Team e Despesas')).toBeInTheDocument();
    expect(screen.queryByText('Funcionários')).not.toBeInTheDocument();
  });
});
