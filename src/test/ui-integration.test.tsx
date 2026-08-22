import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * Testes de integração: confirmam que a UI está de facto ligada à lógica de
 * negócio certa (o botão certo chama a função certa, com os dados certos) —
 * não redundam com store.test.ts, que já cobre a persistência em si.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// StaffPage — "Novo funcionário"
// ---------------------------------------------------------------------------
describe('StaffPage — criar novo funcionário', () => {
  const invokeMock = vi.fn();
  const staffAddMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset().mockResolvedValue({ data: { ok: true, userId: 'new-user-id-123' }, error: null });
    staffAddMock.mockReset();
    localStorage.clear();
    localStorage.setItem('current_tenant_id', 'tenant-1');

    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ user: { id: 'admin-1', name: 'Admin', role: 'admin' }, hasPermission: () => true }),
    }));
    vi.doMock('@/lib/store', () => ({
      staffStore: {
        getAll: () => [],
        add: staffAddMock,
        update: vi.fn(),
        remove: vi.fn(),
      },
    }));
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { functions: { invoke: invokeMock } },
    }));
    vi.doMock('@/hooks/useLicense', () => ({
      useLicense: () => ({ isBasic: false, tier: 'pro' }),
    }));
  });

  it('preenche o formulário (nome/função/telefone/password), cria a conta real via edge function e adiciona ao roster local', async () => {
    const { default: StaffPage } = await import('@/pages/StaffPage');
    const user = userEvent.setup();
    render(<MemoryRouter><StaffPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /novo funcionário/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nome'), 'Maria João');
    await user.type(within(dialog).getByLabelText('Telefone'), '841234567');
    await user.type(within(dialog).getByLabelText('Password'), 'senhaforte123');

    await user.click(within(dialog).getByRole('button', { name: /adicionar/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith('create-staff-account', {
      body: {
        tenantId: 'tenant-1',
        name: 'Maria João',
        role: 'waiter',
        phone: '841234567',
        password: 'senhaforte123',
      },
    });

    await waitFor(() => expect(staffAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-user-id-123', name: 'Maria João' }),
    ));
  });

  it('não pede username nem email — os campos não existem no formulário', async () => {
    const { default: StaffPage } = await import('@/pages/StaffPage');
    const user = userEvent.setup();
    render(<MemoryRouter><StaffPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /novo funcionário/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByLabelText('Username')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('não chama a edge function se a password tiver menos de 8 caracteres', async () => {
    const { default: StaffPage } = await import('@/pages/StaffPage');
    const user = userEvent.setup();
    render(<MemoryRouter><StaffPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /novo funcionário/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('Nome'), 'Teste Curto');
    await user.type(within(dialog).getByLabelText('Telefone'), '841234567');
    await user.type(within(dialog).getByLabelText('Password'), '123');
    await user.click(within(dialog).getByRole('button', { name: /adicionar/i }));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('não chama a edge function se o telefone não for indicado', async () => {
    const { default: StaffPage } = await import('@/pages/StaffPage');
    const user = userEvent.setup();
    render(<MemoryRouter><StaffPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /novo funcionário/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('Nome'), 'Sem Telefone');
    await user.type(within(dialog).getByLabelText('Password'), 'senhaforte123');
    await user.click(within(dialog).getByRole('button', { name: /adicionar/i }));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('remover um funcionário chama delete-staff-account (apaga também a conta de autenticação)', async () => {
    const staffRemoveMock = vi.fn();
    vi.doMock('@/lib/store', () => ({
      staffStore: {
        getAll: () => [{ id: '11111111-1111-1111-1111-111111111111', name: 'Maria João', role: 'waiter' }],
        add: staffAddMock,
        update: vi.fn(),
        remove: staffRemoveMock,
      },
    }));

    const { default: StaffPage } = await import('@/pages/StaffPage');
    const user = userEvent.setup();
    render(<MemoryRouter><StaffPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /remover/i }));
    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /^remover$/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('delete-staff-account', {
      body: { tenantId: 'tenant-1', userId: '11111111-1111-1111-1111-111111111111' },
    }));
    await waitFor(() => expect(staffRemoveMock).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111'));
  });
});

// ---------------------------------------------------------------------------
// TablesPage — criar e editar mesa
// ---------------------------------------------------------------------------
describe('TablesPage — criar e editar mesa', () => {
  const addTableMock = vi.fn();
  const updateTableMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    addTableMock.mockReset();
    updateTableMock.mockReset();

    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ hasRole: (roles: string[]) => roles.includes('admin') }),
    }));
    vi.doMock('@/hooks/useLicense', () => ({
      useLicense: () => ({ isBasic: false, tier: 'pro' }),
    }));
  });

  it('cria uma mesa nova com o número e lugares introduzidos', async () => {
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        tables: [], orders: [], addTable: addTableMock, updateTable: updateTableMock,
        deleteTable: vi.fn(), logPrint: vi.fn(),
        pendingConfirmationOrders: [], confirmPendingOrder: vi.fn(), rejectPendingOrder: vi.fn(),
      }),
    }));
    const { default: TablesPage } = await import('@/pages/TablesPage');
    const user = userEvent.setup();
    render(<MemoryRouter><TablesPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /nova mesa/i }));

    const seats = await screen.findByLabelText('Lugares');
    await user.clear(seats);
    await user.type(seats, '6');

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(addTableMock).toHaveBeenCalledWith({ number: 1, seats: 6, status: 'free' });
  });

  it('edita uma mesa existente ao clicar em "Editar mesa"', async () => {
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        tables: [{ id: 't-1', number: 2, seats: 4, status: 'free' }],
        orders: [], addTable: addTableMock, updateTable: updateTableMock,
        deleteTable: vi.fn(), logPrint: vi.fn(),
        pendingConfirmationOrders: [], confirmPendingOrder: vi.fn(), rejectPendingOrder: vi.fn(),
      }),
    }));
    const { default: TablesPage } = await import('@/pages/TablesPage');
    const user = userEvent.setup();
    render(<MemoryRouter><TablesPage /></MemoryRouter>);

    await user.click(screen.getByTitle('Editar mesa'));

    const seats = await screen.findByLabelText('Lugares');
    await user.clear(seats);
    await user.type(seats, '8');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(updateTableMock).toHaveBeenCalledWith('t-1', { number: 2, seats: 8, status: 'free' });
  });
});

// ---------------------------------------------------------------------------
// TablesPage — "Mover mesa" (T3.5)
// ---------------------------------------------------------------------------
describe('TablesPage — mover pedido de mesa', () => {
  const moveOrderToTableMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    moveOrderToTableMock.mockReset().mockReturnValue({ ok: true });

    vi.doMock('@/context/AuthContext', () => ({
      useAuth: () => ({ hasRole: (roles: string[]) => roles.includes('admin'), user: { tenantId: 't1' } }),
    }));
    vi.doMock('@/hooks/useLicense', () => ({ useLicense: () => ({ isBasic: false, tier: 'pro' }) }));
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        tables: [
          { id: 'table-a', number: 1, seats: 4, status: 'occupied', currentOrderId: 'order-1' },
          { id: 'table-b', number: 2, seats: 4, status: 'free' },
        ],
        orders: [{ id: 'order-1', tableId: 'table-a', tableNumber: 1, items: [], status: 'active', paid: false, total: 500, createdAt: new Date().toISOString() }],
        addTable: vi.fn(), updateTable: vi.fn(), deleteTable: vi.fn(), logPrint: vi.fn(),
        pendingConfirmationOrders: [], confirmPendingOrder: vi.fn(), rejectPendingOrder: vi.fn(),
        moveOrderToTable: moveOrderToTableMock,
      }),
    }));
  });

  it('"Mover mesa" só aparece quando há mesa livre, e escolher uma chama moveOrderToTable', async () => {
    const { default: TablesPage } = await import('@/pages/TablesPage');
    const user = userEvent.setup();
    render(<MemoryRouter><TablesPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Mover mesa' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 2' }));

    expect(moveOrderToTableMock).toHaveBeenCalledWith('order-1', 'table-b');
  });

  it('sem mesas livres, o botão "Mover mesa" não aparece', async () => {
    vi.doMock('@/hooks/useRestaurant', () => ({
      useRestaurant: () => ({
        tables: [{ id: 'table-a', number: 1, seats: 4, status: 'occupied', currentOrderId: 'order-1' }],
        orders: [{ id: 'order-1', tableId: 'table-a', tableNumber: 1, items: [], status: 'active', paid: false, total: 500, createdAt: new Date().toISOString() }],
        addTable: vi.fn(), updateTable: vi.fn(), deleteTable: vi.fn(), logPrint: vi.fn(),
        pendingConfirmationOrders: [], confirmPendingOrder: vi.fn(), rejectPendingOrder: vi.fn(),
        moveOrderToTable: moveOrderToTableMock,
      }),
    }));
    const { default: TablesPage } = await import('@/pages/TablesPage');
    render(<MemoryRouter><TablesPage /></MemoryRouter>);

    expect(screen.queryByRole('button', { name: 'Mover mesa' })).not.toBeInTheDocument();
  });
});
