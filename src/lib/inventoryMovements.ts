/**
 * Histórico de movimentos de stock (tabela `inventory_movements`). A maior
 * parte das linhas vem do trigger `deduct_inventory_on_order_item`
 * (dedução automática a cada venda, ver migration
 * 20260822190000_inventory_movements.sql) — este ficheiro só cobre o lado
 * do cliente: registar um ajuste manual (feito em InventoryPage.tsx) e ler
 * o histórico de um item.
 */
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

function tenantId(): string | null { return localStorage.getItem('current_tenant_id'); }
function warn(op: string, err: { message: string } | null) { if (err) console.warn(`[cloud-sync] ${op} failed: ${err.message}`); }

export interface InventoryMovement {
  id: string;
  inventoryItemId: string;
  delta: number;
  reason: string;
  referenceId?: string;
  createdByName?: string;
  createdAt: string;
}

/** Regista um ajuste manual de stock — a mudança em si já foi aplicada
 *  localmente/na nuvem via `inventoryStore.update()` pelo chamador; isto é
 *  só o rasto histórico. Ignorado se `delta` for 0 (nada mudou de facto). */
export function recordInventoryAdjustment(inventoryItemId: string, delta: number, createdByName: string) {
  const t = tenantId();
  if (!t || !isUuid(inventoryItemId) || delta === 0) return;
  void cloud('inventory_movements').insert({
    inventory_item_id: inventoryItemId, tenant_id: t, delta, reason: 'Ajuste manual', created_by_name: createdByName,
  }).then(({ error }) => warn('inventoryMovements.insert', error));
}

export async function fetchInventoryMovements(inventoryItemId: string): Promise<InventoryMovement[]> {
  if (!isUuid(inventoryItemId)) return [];
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('id, inventory_item_id, delta, reason, reference_id, created_by_name, created_at')
    .eq('inventory_item_id', inventoryItemId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) { warn('inventoryMovements.fetch', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id, inventoryItemId: r.inventory_item_id, delta: Number(r.delta), reason: r.reason,
    referenceId: r.reference_id ?? undefined, createdByName: r.created_by_name ?? undefined, createdAt: r.created_at,
  }));
}
