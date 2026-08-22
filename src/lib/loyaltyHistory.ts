/**
 * Histórico "append-only" de ajustes manuais de pontos de fidelidade
 * (bónus/resgate) — mesmo papel que `expense_amount_history` tem para
 * despesas (ver src/lib/expenses.ts): nunca editado/apagado pela app, só
 * lido para mostrar "quem/quando/quanto" no perfil do cliente.
 */
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

function tenantId(): string | null { return localStorage.getItem('current_tenant_id'); }
function warn(op: string, err: { message: string } | null) { if (err) console.warn(`[cloud-sync] ${op} failed: ${err.message}`); }

export interface LoyaltyHistoryEntry {
  id: string;
  customerId: string;
  delta: number;
  reason: string;
  createdByName: string;
  createdAt: string;
}

/** Regista um ajuste manual (positivo = bónus, negativo = resgate). Falha
 *  silenciosamente se offline/sem tenant — o ajuste em si (pointsAdjustment)
 *  já foi aplicado localmente pelo chamador; isto é só o rasto histórico. */
export function recordLoyaltyAdjustment(customerId: string, delta: number, reason: string, createdByName: string) {
  const t = tenantId();
  if (!t || !isUuid(customerId)) return;
  void cloud('loyalty_points_history').insert({
    customer_id: customerId, tenant_id: t, delta, reason, created_by_name: createdByName,
  }).then(({ error }) => warn('loyaltyHistory.insert', error));
}

export async function fetchLoyaltyHistory(customerId: string): Promise<LoyaltyHistoryEntry[]> {
  if (!isUuid(customerId)) return [];
  const { data, error } = await supabase
    .from('loyalty_points_history')
    .select('id, customer_id, delta, reason, created_by_name, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) { warn('loyaltyHistory.fetch', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id, customerId: r.customer_id, delta: r.delta, reason: r.reason,
    createdByName: r.created_by_name, createdAt: r.created_at,
  }));
}
