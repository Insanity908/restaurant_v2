import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1', type: 'dine-in', tableNumber: 5, status: 'active',
    items: [{ id: 'item-1', menuItemId: 'menu-1', name: 'Frango Grelhado', quantity: 2, price: 350, status: 'pending' }],
    total: 700, paid: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// KitchenPage — avançar o estado de um item
// ---------------------------------------------------------------------------
describe('KitchenPage — avançar estado de um item', () => {
  const updateOrderItemStatusMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    updateOrderItemStatusMock.mockReset();
    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ user: { id: 'k-1', name: 'Cozinha', role: 'kitchen' } }),
    }));
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        orders: [order()], updateOrderItemStatus: updateOrderItemStatusMock,
        updateOrder: vi.fn(), cancelOrder: vi.fn(), menuItems: [],
      }),
    }));
  });

  it('clicar num item pendente avança-o para "preparando"', async () => {
    const { default: KitchenPage } = await import('@/pages/KitchenPage');
    const user = userEvent.setup();
    render(<KitchenPage />);

    await user.click(screen.getByRole('button', { name: /Frango Grelhado/i }));

    expect(updateOrderItemStatusMock).toHaveBeenCalledWith('order-1', 'item-1', 'preparing');
  });
});

// ---------------------------------------------------------------------------
// MenuPage — alternar disponibilidade em modo de gestão
// ---------------------------------------------------------------------------
describe('MenuPage — alternar disponibilidade de um prato', () => {
  const updateMenuItemMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    updateMenuItemMock.mockReset();
    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ hasPermission: () => true }),
    }));
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        menuItems: [{ id: 'm-1', name: 'Pizza Pepperoni', price: 500, category: 'Popular', available: true }],
        tables: [], orders: [], inventory: [],
        createOrder: vi.fn(), appendOrderItems: vi.fn(), generateId: () => 'x',
        addMenuItem: vi.fn(), updateMenuItem: updateMenuItemMock, deleteMenuItem: vi.fn(),
      }),
    }));
  });

  it('em modo "Gerir", desligar o switch marca o prato como indisponível', async () => {
    const { default: MenuPage } = await import('@/pages/MenuPage');
    const user = userEvent.setup();
    render(<MemoryRouter><MenuPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /gerir/i }));
    await user.click(screen.getByRole('switch'));

    expect(updateMenuItemMock).toHaveBeenCalledWith('m-1', { available: false });
  });
});

// ---------------------------------------------------------------------------
// POSPage — finalizar pagamento de um pedido
// ---------------------------------------------------------------------------
describe('POSPage — finalizar pagamento', () => {
  const completeOrderMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    completeOrderMock.mockReset().mockReturnValue({ ok: true });
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        activeOrders: [order({ items: [{ id: 'item-1', menuItemId: 'menu-1', name: 'Frango Grelhado', quantity: 2, price: 350, status: 'served' }] })],
        orders: [], completeOrder: completeOrderMock, cancelOrder: vi.fn(), logPrint: vi.fn(),
      }),
    }));
  });

  it('seleccionar um pedido totalmente servido e confirmar cobra com o método por omissão (dinheiro)', async () => {
    const { default: POSPage } = await import('@/pages/POSPage');
    const user = userEvent.setup();
    render(<POSPage />);

    await user.click(screen.getByRole('button', { name: /Mesa 5/i }));
    await user.click(screen.getByRole('button', { name: /confirmar pagamento/i }));

    expect(completeOrderMock).toHaveBeenCalledWith(
      'order-1', 'cash', 0, expect.objectContaining({ discount: 0 }),
    );
  });
});

// ---------------------------------------------------------------------------
// SettingsPage — guardar o nome do estabelecimento
// ---------------------------------------------------------------------------
describe('SettingsPage — guardar identidade visual', () => {
  const updateSettingsMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    updateSettingsMock.mockReset();
    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ user: { id: 'admin-1', name: 'Admin', role: 'admin', username: 'admin1' }, refreshProfile: vi.fn() }),
    }));
    vi.doMock('@/hooks/useSettings', () => ({
      useSettings: () => ({
        settings: {
          brandName: 'SABOR DE NAMPULA', iconEmoji: '☕', receiptShowLogo: false,
          primaryHue: 30, primarySaturation: 95, primaryLightness: 55,
          backgroundHue: 220, backgroundSaturation: 20, backgroundLightness: 10,
          mpesaNumber: '', mpesaName: '', emolaNumber: '', bankName: '', bankAccount: '',
          bankIban: '', bankHolder: '', taxId: '', address: '', phone: '',
        },
        update: updateSettingsMock,
        reset: vi.fn(),
      }),
    }));
  });

  it('alterar o nome do estabelecimento e clicar em "Guardar" chama update() com o novo nome', async () => {
    const { default: SettingsPage } = await import('@/pages/SettingsPage');
    const user = userEvent.setup();
    render(<SettingsPage />);

    const brandInput = screen.getByPlaceholderText('SABOR DE NAMPULA');
    await user.clear(brandInput);
    await user.type(brandInput, 'Sabor de Maputo');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    expect(updateSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ brandName: 'Sabor de Maputo' }));
  });
});

// ---------------------------------------------------------------------------
// SuperAdminPage — desbloquear um restaurante
// ---------------------------------------------------------------------------
describe('SuperAdminPage — desbloquear restaurante', () => {
  const unblockMock = vi.fn();
  const blockedTenant = {
    id: 'tenant-1', name: 'Restaurante Bloqueado', ownerEmail: 'dono@teste.mz',
    licenseKey: 'lic_abc123', createdAt: new Date().toISOString(),
    subscription: { plan: 'monthly', status: 'blocked', blockedByAdmin: true, blockReason: 'Pagamento em atraso' },
  };

  beforeEach(() => {
    vi.resetModules();
    unblockMock.mockReset().mockResolvedValue({ ok: true });
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: {
        getAll: () => [blockedTenant],
        daysUntilExpiry: () => 0,
        block: vi.fn(), unblock: unblockMock, extend: vi.fn(), activatePlan: vi.fn(), remove: vi.fn(),
      },
      fetchTenants: vi.fn().mockResolvedValue([blockedTenant]),
      fetchTenantTeams: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      getPaymentAccounts: () => ({}),
      savePaymentAccounts: vi.fn(),
      fetchPaymentAccounts: vi.fn().mockResolvedValue({}),
    }));
  });

  it('clicar em "Desbloquear" chama tenantStore.unblock com o id certo', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    const unblockBtn = await screen.findByRole('button', { name: /desbloquear/i });
    await user.click(unblockBtn);

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /desbloquear/i }));

    await waitFor(() => expect(unblockMock).toHaveBeenCalledWith('tenant-1'));
  });
});

// ---------------------------------------------------------------------------
// SuperAdminPage — bloquear / estender / reduzir passam pelo diálogo em dois
// passos (motivo|dias -> confirmação genérica). Regressão coberta aqui: o
// alvo (blockTarget/extendTarget/reduceTarget) é limpo assim que o segundo
// diálogo abre (para não reabrir o primeiro por cima), por isso as acções
// têm de receber o alvo por parâmetro em vez de o lerem de volta do state
// nesse momento — já esteve partido (voltava sempre a dar no-op silencioso).
// ---------------------------------------------------------------------------
describe('SuperAdminPage — bloquear/estender/reduzir restaurante', () => {
  const blockMock = vi.fn();
  const extendMock = vi.fn();
  const reduceMock = vi.fn();
  const activeTenant = {
    id: 'tenant-2', name: 'Restaurante Ativo', ownerEmail: 'dono2@teste.mz',
    licenseKey: 'lic_def456', createdAt: new Date().toISOString(),
    subscription: { plan: 'monthly', status: 'active', blockedByAdmin: false, expiresAt: new Date(Date.now() + 10 * 86400000).toISOString() },
  };

  beforeEach(() => {
    vi.resetModules();
    blockMock.mockReset().mockResolvedValue({ ok: true });
    extendMock.mockReset().mockResolvedValue({ ok: true });
    reduceMock.mockReset().mockResolvedValue({ ok: true });
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: {
        getAll: () => [activeTenant],
        daysUntilExpiry: () => 10,
        block: blockMock, unblock: vi.fn(), extend: extendMock, reduce: reduceMock, activatePlan: vi.fn(), remove: vi.fn(),
      },
      fetchTenants: vi.fn().mockResolvedValue([activeTenant]),
      fetchTenantTeams: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      getPaymentAccounts: () => ({}),
      savePaymentAccounts: vi.fn(),
      fetchPaymentAccounts: vi.fn().mockResolvedValue({}),
    }));
  });

  it('clicar em "Bloquear" (motivo -> confirmar) chama tenantStore.block com o id certo', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('button', { name: /^bloquear$/i }));
    const reasonDialog = await screen.findByRole('dialog');
    await user.click(within(reasonDialog).getByRole('button', { name: /^bloquear$/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /^bloquear$/i }));

    await waitFor(() => expect(blockMock).toHaveBeenCalledWith('tenant-2', expect.any(String)));
  });

  it('clicar em "+ Dias" (dias -> confirmar) chama tenantStore.extend com o id certo', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('button', { name: /\+ dias/i }));
    const daysDialog = await screen.findByRole('dialog');
    await user.click(within(daysDialog).getByRole('button', { name: /^estender$/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /^estender$/i }));

    await waitFor(() => expect(extendMock).toHaveBeenCalledWith('tenant-2', 30));
  });

  it('clicar em "- Dias" (dias -> confirmar) chama tenantStore.reduce com o id certo', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('button', { name: /- dias/i }));
    const daysDialog = await screen.findByRole('dialog');
    await user.click(within(daysDialog).getByRole('button', { name: /^reduzir$/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /^reduzir$/i }));

    await waitFor(() => expect(reduceMock).toHaveBeenCalledWith('tenant-2', 30));
  });
});
