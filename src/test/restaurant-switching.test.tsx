import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// RestaurantSwitcherDialog — trocar restaurante existente ou criar mais um,
// partilhado entre o dropdown do desktop e o menu "Mais" do mobile.
// ---------------------------------------------------------------------------
describe('RestaurantSwitcherDialog', () => {
  const switchTenantMock = vi.fn();
  const createMock = vi.fn();
  const tenants = [
    { id: 'tenant-a', name: 'Café Central' },
    { id: 'tenant-b', name: 'Sabor de Maputo' },
  ];

  beforeEach(() => {
    vi.resetModules();
    switchTenantMock.mockReset();
    createMock.mockReset().mockResolvedValue({ id: 'tenant-c', name: 'Nova Unidade' });
    vi.doMock('@/context/AuthContext', () => ({
      useOptionalAuth: () => ({
        user: { id: 'admin-1', name: 'Admin', email: 'admin@teste.mz', role: 'admin', tenantIds: ['tenant-a', 'tenant-b'] },
        switchTenant: switchTenantMock,
      }),
    }));
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: {
        getAll: () => tenants,
        current: () => tenants[0],
        setCurrent: vi.fn(),
        create: createMock,
      },
    }));
  });

  it('lista os restaurantes do utilizador e troca ao clicar', async () => {
    const { default: RestaurantSwitcherDialog } = await import('@/components/RestaurantSwitcherDialog');
    const user = userEvent.setup();
    render(<RestaurantSwitcherDialog open onOpenChange={() => {}} />);

    await user.click(screen.getByText('Sabor de Maputo'));

    expect(switchTenantMock).toHaveBeenCalledWith('tenant-b');
  });

  it('criar um novo restaurante chama tenantStore.create com o nome indicado', async () => {
    const { default: RestaurantSwitcherDialog } = await import('@/components/RestaurantSwitcherDialog');
    const user = userEvent.setup();
    render(<RestaurantSwitcherDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText('Adicionar restaurante'), 'Nova Unidade');
    await user.click(screen.getByRole('button', { name: /criar/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({ name: 'Nova Unidade', ownerEmail: 'admin@teste.mz', ownerName: 'Admin' }));
  });
});

// ---------------------------------------------------------------------------
// BlockedPage — troca para outro restaurante quando bloqueado, dados de
// pagamento manual e submissão de comprovativo.
// ---------------------------------------------------------------------------
describe('BlockedPage', () => {
  const switchTenantMock = vi.fn();
  const logoutMock = vi.fn();
  const submitPaymentMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    switchTenantMock.mockReset();
    logoutMock.mockReset();
    submitPaymentMock.mockReset().mockResolvedValue(true);
    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({
        user: { id: 'admin-1', name: 'Admin', role: 'admin', tenantIds: ['tenant-blocked', 'tenant-ok'] },
        logout: logoutMock,
        switchTenant: switchTenantMock,
      }),
    }));
    vi.doMock('@/hooks/useLicense', () => ({
      useLicense: () => ({
        tenant: {
          id: 'tenant-blocked',
          subscription: { status: 'blocked', blockReason: 'Falta de pagamento' },
        },
      }),
    }));
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: {
        getById: (id: string) => (id === 'tenant-ok' ? { id: 'tenant-ok', name: 'Restaurante OK' } : null),
      },
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      fetchPaymentAccounts: vi.fn().mockResolvedValue({ bankAccount: '123456', bankName: 'BCI' }),
      hasAnyPaymentAccounts: (a: { bankAccount?: string; mobileMoney?: string }) => !!(a.bankAccount || a.mobileMoney),
    }));
    vi.doMock('@/lib/paymentSubmissions', () => ({
      fetchSubmissionsForTenant: vi.fn().mockResolvedValue([]),
      submitPayment: submitPaymentMock,
    }));
  });

  it('mostra a opção de mudar para outro restaurante do utilizador', async () => {
    const { default: BlockedPage } = await import('@/pages/BlockedPage');
    const user = userEvent.setup();
    render(<BlockedPage />);

    await user.click(await screen.findByText('Restaurante OK'));

    expect(switchTenantMock).toHaveBeenCalledWith('tenant-ok');
  });

  it('mostra os dados de pagamento manual e submete um comprovativo', async () => {
    const { default: BlockedPage } = await import('@/pages/BlockedPage');
    const user = userEvent.setup();
    render(<BlockedPage />);

    expect(await screen.findByText('123456')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Referência'), 'TX-999');
    await user.click(screen.getByRole('button', { name: /enviar comprovativo/i }));

    await waitFor(() => expect(submitPaymentMock).toHaveBeenCalledWith('tenant-blocked', 'TX-999', undefined));
    expect(await screen.findByText(/comprovativo enviado/i)).toBeInTheDocument();
  });

  it('"Sair" continua a chamar logout', async () => {
    const { default: BlockedPage } = await import('@/pages/BlockedPage');
    const user = userEvent.setup();
    render(<BlockedPage />);

    await user.click(await screen.findByRole('button', { name: /sair/i }));

    expect(logoutMock).toHaveBeenCalled();
  });
});
