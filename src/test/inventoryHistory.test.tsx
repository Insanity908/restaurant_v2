import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InventoryItem } from '@/types/restaurant';

/**
 * T3.4: histórico de movimentos de stock, lado do cliente. Cobre: abrir o
 * histórico de um item mostra os movimentos já existentes, e editar o
 * "Stock Actual" no diálogo regista um ajuste manual com o delta certo e o
 * nome de quem o fez.
 */

const ITEM: InventoryItem = {
  id: 'inv-1', name: 'Queijo', unit: 'kg', currentStock: 10, minStock: 2,
  costPerUnit: 300, linkedMenuItemIds: [], usagePerServing: 0.2,
};

const updateInventoryItemMock = vi.fn();
const recordInventoryAdjustmentMock = vi.fn();
const fetchInventoryMovementsMock = vi.fn().mockResolvedValue([]);

vi.mock('@/hooks/useRestaurant', () => ({
  useRestaurant: () => ({
    inventory: [ITEM], lowStockItems: [], menuItems: [],
    addInventoryItem: vi.fn(), updateInventoryItem: updateInventoryItemMock, deleteInventoryItem: vi.fn(),
  }),
}));

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', name: 'Gerente Ana', role: 'manager' },
      hasPermission: () => true,
    }),
  };
});

vi.mock('@/lib/inventoryMovements', () => ({
  recordInventoryAdjustment: (...a: unknown[]) => recordInventoryAdjustmentMock(...a),
  fetchInventoryMovements: (...a: unknown[]) => fetchInventoryMovementsMock(...a),
}));

async function renderInventoryPage() {
  const { default: InventoryPage } = await import('@/pages/InventoryPage');
  return render(<InventoryPage />);
}

describe('InventoryPage — histórico de movimentos de stock', () => {
  beforeEach(() => {
    vi.resetModules();
    updateInventoryItemMock.mockReset();
    recordInventoryAdjustmentMock.mockReset();
    fetchInventoryMovementsMock.mockReset().mockResolvedValue([]);
  });

  it('"Histórico" mostra os movimentos já existentes do item', async () => {
    fetchInventoryMovementsMock.mockResolvedValue([
      { id: 'm1', inventoryItemId: 'inv-1', delta: -2, reason: 'Venda', createdAt: '2026-08-22T10:00:00.000Z' },
      { id: 'm2', inventoryItemId: 'inv-1', delta: 5, reason: 'Ajuste manual', createdByName: 'Gerente Ana', createdAt: '2026-08-21T10:00:00.000Z' },
    ]);
    const user = userEvent.setup();
    await renderInventoryPage();

    await user.click(screen.getByRole('button', { name: 'Histórico' }));

    expect(fetchInventoryMovementsMock).toHaveBeenCalledWith('inv-1');
    expect(await screen.findByText(/-2 kg/)).toBeInTheDocument();
    expect(await screen.findByText(/Ajuste manual · Gerente Ana/)).toBeInTheDocument();
  });

  it('editar o Stock Actual regista um ajuste manual com o delta e o nome de quem editou', async () => {
    const user = userEvent.setup();
    await renderInventoryPage();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    // Sem htmlFor/id a ligar os <Label> aos <Input> neste diálogo — "Stock
    // Actual" é o primeiro dos 3 inputs numéricos (Stock Actual, Stock
    // Mínimo, Custo por Unidade), pela ordem em que aparecem no formulário.
    const stockInput = (await screen.findAllByRole('spinbutton'))[0] as HTMLInputElement;
    await user.clear(stockInput);
    await user.type(stockInput, '7');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(updateInventoryItemMock).toHaveBeenCalledWith('inv-1', expect.objectContaining({ currentStock: 7 }));
    await waitFor(() => expect(recordInventoryAdjustmentMock).toHaveBeenCalledWith('inv-1', -3, 'Gerente Ana'));
  });

  it('guardar sem mudar o stock não regista nenhum ajuste', async () => {
    const user = userEvent.setup();
    await renderInventoryPage();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(updateInventoryItemMock).toHaveBeenCalled();
    expect(recordInventoryAdjustmentMock).not.toHaveBeenCalled();
  });
});
