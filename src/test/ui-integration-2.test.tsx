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
    render(<MemoryRouter><KitchenPage /></MemoryRouter>);

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
// POSPage — dividir conta / pagamento parcial (T4.1)
// ---------------------------------------------------------------------------
describe('POSPage — dividir conta', () => {
  const completeOrderMock = vi.fn();
  const addPartialPaymentMock = vi.fn();
  const removeLastPaymentMock = vi.fn();

  function servedOrder(overrides: Record<string, unknown> = {}) {
    return order({
      items: [{ id: 'item-1', menuItemId: 'menu-1', name: 'Frango Grelhado', quantity: 2, price: 350, status: 'served' }],
      total: 700,
      ...overrides,
    });
  }

  function mockRestaurant(activeOrder: ReturnType<typeof servedOrder>) {
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        activeOrders: [activeOrder], orders: [],
        completeOrder: completeOrderMock, cancelOrder: vi.fn(), logPrint: vi.fn(),
        addPartialPayment: addPartialPaymentMock, removeLastPayment: removeLastPaymentMock,
      }),
    }));
  }

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    completeOrderMock.mockReset().mockResolvedValue({ ok: true });
    addPartialPaymentMock.mockReset();
    removeLastPaymentMock.mockReset();
  });

  it('registar uma parcela parcial chama addPartialPayment mas NÃO completeOrder', async () => {
    addPartialPaymentMock.mockReturnValue({ ok: true, remaining: 400 });
    mockRestaurant(servedOrder());
    const { default: POSPage } = await import('@/pages/POSPage');
    const user = userEvent.setup();
    render(<POSPage />);

    await user.click(screen.getByRole('button', { name: /Mesa 5/i }));
    await user.click(screen.getByRole('button', { name: /dividir conta/i }));

    const installmentInput = screen.getByLabelText(/valor desta parcela/i);
    await user.clear(installmentInput);
    await user.type(installmentInput, '300');
    await user.click(screen.getByRole('button', { name: 'Registar parcela' }));

    expect(addPartialPaymentMock).toHaveBeenCalledWith('order-1', 'cash', 300, 700);
    expect(completeOrderMock).not.toHaveBeenCalled();
  });

  it('a última parcela (atinge o total) chama completeOrder com o método dessa parcela', async () => {
    addPartialPaymentMock.mockReturnValue({ ok: true, remaining: 0 });
    mockRestaurant(servedOrder());
    const { default: POSPage } = await import('@/pages/POSPage');
    const user = userEvent.setup();
    render(<POSPage />);

    await user.click(screen.getByRole('button', { name: /Mesa 5/i }));
    await user.click(screen.getByRole('button', { name: /dividir conta/i }));
    // Sem tocar no valor da parcela, o valor por omissão é o que falta (700).
    await user.click(screen.getByRole('button', { name: /registar parcela e finalizar/i }));

    expect(addPartialPaymentMock).toHaveBeenCalledWith('order-1', 'cash', 700, 700);
    expect(completeOrderMock).toHaveBeenCalledWith('order-1', 'cash', 0, expect.objectContaining({ discount: 0 }));
  });

  it('"Desfazer" na última parcela chama removeLastPayment', async () => {
    mockRestaurant(servedOrder({ payments: [{ id: 'p1', method: 'cash', amount: 300, at: new Date().toISOString() }] }));
    const { default: POSPage } = await import('@/pages/POSPage');
    const user = userEvent.setup();
    render(<POSPage />);

    await user.click(screen.getByRole('button', { name: /Mesa 5/i }));
    await user.click(screen.getByRole('button', { name: /dividir conta/i }));
    await user.click(screen.getByRole('button', { name: /desfazer/i }));

    expect(removeLastPaymentMock).toHaveBeenCalledWith('order-1');
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

// ---------------------------------------------------------------------------
// SuperAdminPage — tab "Pagamentos pendentes": comprovativos submetidos a
// partir de /blocked (ver BlockedPage) aparecem aqui para o superadmin
// confirmar ("Ativar plano", pré-preenchido com a referência) ou dispensar.
// ---------------------------------------------------------------------------
describe('SuperAdminPage — pagamentos pendentes', () => {
  const activatePlanMock = vi.fn();
  const markSubmissionStatusMock = vi.fn();
  const tenant = {
    id: 'tenant-3', name: 'Restaurante Pendente', ownerEmail: 'dono3@teste.mz',
    licenseKey: 'lic_ghi789', createdAt: new Date().toISOString(),
    subscription: { plan: 'monthly', status: 'blocked', blockedByAdmin: true, blockReason: 'Falta de pagamento' },
  };
  const submission = {
    id: 'sub-1', tenantId: 'tenant-3', tenantName: 'Restaurante Pendente',
    reference: 'REF-12345', note: undefined, method: 'manual', status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetModules();
    activatePlanMock.mockReset().mockResolvedValue({ ok: true });
    markSubmissionStatusMock.mockReset().mockResolvedValue(true);
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: {
        getAll: () => [tenant],
        daysUntilExpiry: () => 0,
        block: vi.fn(), unblock: vi.fn(), extend: vi.fn(), reduce: vi.fn(),
        activatePlan: activatePlanMock, remove: vi.fn(),
      },
      fetchTenants: vi.fn().mockResolvedValue([tenant]),
      fetchTenantTeams: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      getPaymentAccounts: () => ({}),
      savePaymentAccounts: vi.fn(),
      fetchPaymentAccounts: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentSubmissions', () => ({
      fetchPendingSubmissions: vi.fn().mockResolvedValue([submission]),
      markSubmissionStatus: markSubmissionStatusMock,
    }));
  });

  it('mostra o comprovativo pendente com a referência submetida', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /pagamentos pendentes/i }));
    expect(await screen.findByText('Restaurante Pendente')).toBeInTheDocument();
    expect(screen.getByText(/REF-12345/)).toBeInTheDocument();
  });

  it('"Ativar plano" a partir do comprovativo pré-preenche a referência e, ao confirmar, marca a submissão como resolvida', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /pagamentos pendentes/i }));
    await user.click(await screen.findByRole('button', { name: /ativar plano/i }));

    const activateDialog = await screen.findByRole('dialog');
    expect(within(activateDialog).getByDisplayValue('REF-12345')).toBeInTheDocument();
    await user.click(within(activateDialog).getByRole('button', { name: /confirmar ativação/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /confirmar ativação/i }));

    await waitFor(() => expect(activatePlanMock).toHaveBeenCalledWith('tenant-3', 'monthly', 'REF-12345'));
    await waitFor(() => expect(markSubmissionStatusMock).toHaveBeenCalledWith('sub-1', 'resolved'));
  });

  it('"Dispensar" marca a submissão como dispensada sem tocar na subscrição', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /pagamentos pendentes/i }));
    await user.click(await screen.findByRole('button', { name: /dispensar/i }));

    await waitFor(() => expect(markSubmissionStatusMock).toHaveBeenCalledWith('sub-1', 'dismissed'));
    expect(activatePlanMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SuperAdminPage — tab "Feedback": mensagens enviadas por qualquer
// utilizador (não só admins) via FeedbackDialog.
// ---------------------------------------------------------------------------
describe('SuperAdminPage — feedback', () => {
  const markFeedbackStatusMock = vi.fn();
  const feedbackItem = {
    id: 'fb-1', tenantId: 'tenant-4', tenantName: 'Restaurante Feedback',
    name: 'Garçom Teste', role: 'waiter', message: 'O ecrã de caixa está lento',
    status: 'unread' as const, createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetModules();
    markFeedbackStatusMock.mockReset().mockResolvedValue(true);
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: { getAll: () => [], daysUntilExpiry: () => 0, block: vi.fn(), unblock: vi.fn(), extend: vi.fn(), reduce: vi.fn(), activatePlan: vi.fn(), remove: vi.fn() },
      fetchTenants: vi.fn().mockResolvedValue([]),
      fetchTenantTeams: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      getPaymentAccounts: () => ({}), savePaymentAccounts: vi.fn(), fetchPaymentAccounts: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentSubmissions', () => ({
      fetchPendingSubmissions: vi.fn().mockResolvedValue([]), markSubmissionStatus: vi.fn(),
    }));
    vi.doMock('@/lib/feedback', () => ({
      fetchFeedback: vi.fn().mockResolvedValue([feedbackItem]),
      markFeedbackStatus: markFeedbackStatusMock,
    }));
  });

  it('mostra o feedback recebido e marca como lido', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /feedback/i }));
    expect(await screen.findByText('O ecrã de caixa está lento')).toBeInTheDocument();
    expect(screen.getByText('Garçom Teste')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /marcar como lido/i }));

    await waitFor(() => expect(markFeedbackStatusMock).toHaveBeenCalledWith('fb-1', 'read'));
  });
});

// ---------------------------------------------------------------------------
// SuperAdminPage — tab "Galeria": remover uma imagem preset agora pede
// confirmação (AlertDialog partilhado, mesmo padrão de bloquear/desbloquear)
// em vez de apagar directo ao clique — regressão a proteger explicitamente.
// ---------------------------------------------------------------------------
describe('SuperAdminPage — galeria de imagens preset', () => {
  const deletePresetImageMock = vi.fn();
  const presetImage = {
    id: 'preset-1', category: 'Bebidas', label: 'Coca-Cola', storagePath: 'bebidas/coca.jpg',
  };

  beforeEach(() => {
    vi.resetModules();
    deletePresetImageMock.mockReset().mockResolvedValue(true);
    vi.doMock('@/lib/tenants', () => ({
      tenantStore: { getAll: () => [], daysUntilExpiry: () => 0, block: vi.fn(), unblock: vi.fn(), extend: vi.fn(), reduce: vi.fn(), activatePlan: vi.fn(), remove: vi.fn() },
      fetchTenants: vi.fn().mockResolvedValue([]),
      fetchTenantTeams: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentAccounts', () => ({
      getPaymentAccounts: () => ({}), savePaymentAccounts: vi.fn(), fetchPaymentAccounts: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock('@/lib/paymentSubmissions', () => ({
      fetchPendingSubmissions: vi.fn().mockResolvedValue([]), markSubmissionStatus: vi.fn(),
    }));
    vi.doMock('@/lib/feedback', () => ({
      fetchFeedback: vi.fn().mockResolvedValue([]), markFeedbackStatus: vi.fn(),
    }));
    vi.doMock('@/lib/presetImages', () => ({
      fetchPresetImages: vi.fn().mockResolvedValue([presetImage]),
      uploadPresetImage: vi.fn(),
      deletePresetImage: deletePresetImageMock,
    }));
  });

  it('clicar no ícone de lixeira NÃO apaga logo — só depois de confirmar no AlertDialog', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /galeria/i }));
    await user.click(await screen.findByRole('button', { name: /remover coca-cola/i }));

    // O clique inicial só abre o diálogo — nunca apaga directamente.
    expect(deletePresetImageMock).not.toHaveBeenCalled();

    const confirmDialog = await screen.findByRole('alertdialog');
    expect(within(confirmDialog).getByText(/coca-cola/i)).toBeInTheDocument();
    await user.click(within(confirmDialog).getByRole('button', { name: /^remover$/i }));

    await waitFor(() => expect(deletePresetImageMock).toHaveBeenCalledWith('preset-1', 'bebidas/coca.jpg'));
  });

  it('cancelar no AlertDialog não chama deletePresetImage', async () => {
    const { default: SuperAdminPage } = await import('@/pages/SuperAdminPage');
    const user = userEvent.setup();
    render(<SuperAdminPage />);

    await user.click(await screen.findByRole('tab', { name: /galeria/i }));
    await user.click(await screen.findByRole('button', { name: /remover coca-cola/i }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /cancelar/i }));

    expect(deletePresetImageMock).not.toHaveBeenCalled();
  });
});
