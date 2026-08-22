import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * T3.4: histórico de movimentos de stock. A maioria dos movimentos vem do
 * trigger `deduct_inventory_on_order_item` (verificado directamente contra
 * produção com SQL — ver spec doc), este teste cobre só o lado do cliente:
 * registar um ajuste manual e ler o histórico de um item.
 */

const insertMock = vi.fn().mockReturnValue({ error: null });
vi.mock('@/lib/outbox', () => ({ cloud: () => ({ insert: (v: unknown) => { insertMock(v); return Promise.resolve({ error: null }); } }) }));

const selectChain = {
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ select: () => selectChain }) },
}));

import { recordInventoryAdjustment, fetchInventoryMovements } from '@/lib/inventoryMovements';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('current_tenant_id', 'tenant-1');
  insertMock.mockClear();
  selectChain.limit.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('recordInventoryAdjustment', () => {
  it('regista um ajuste com o delta e o nome de quem fez', () => {
    recordInventoryAdjustment(VALID_UUID, -3, 'Gerente Ana');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      inventory_item_id: VALID_UUID, tenant_id: 'tenant-1', delta: -3, reason: 'Ajuste manual', created_by_name: 'Gerente Ana',
    }));
  });

  it('não regista nada quando o delta é 0 (nada mudou de facto)', () => {
    recordInventoryAdjustment(VALID_UUID, 0, 'Gerente Ana');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('não regista nada sem tenant activo', () => {
    localStorage.removeItem('current_tenant_id');
    recordInventoryAdjustment(VALID_UUID, 5, 'Gerente Ana');
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('fetchInventoryMovements', () => {
  it('mapeia as linhas para o formato do domínio', async () => {
    selectChain.limit.mockResolvedValue({
      data: [{ id: 'm1', inventory_item_id: VALID_UUID, delta: '-2', reason: 'Venda', reference_id: 'order-1', created_by_name: null, created_at: '2026-08-22T10:00:00.000Z' }],
      error: null,
    });
    const rows = await fetchInventoryMovements(VALID_UUID);
    expect(rows).toEqual([{
      id: 'm1', inventoryItemId: VALID_UUID, delta: -2, reason: 'Venda', referenceId: 'order-1', createdByName: undefined, createdAt: '2026-08-22T10:00:00.000Z',
    }]);
  });

  it('devolve [] para um id que não é UUID (sem pedido de rede)', async () => {
    const rows = await fetchInventoryMovements('not-a-uuid');
    expect(rows).toEqual([]);
    expect(selectChain.limit).not.toHaveBeenCalled();
  });
});
