/**
 * Fila de "paguei, aqui está a referência" (tabela `payment_submissions`).
 *
 * Puramente informativa: submeter uma referência NÃO desbloqueia nada por si
 * só — é o superadmin que, depois de conferir, usa a acção "Ativar plano"
 * já existente (ver tenantStore.activatePlan em tenants.ts) para desbloquear
 * de facto. Sem cache em localStorage (ao contrário de tenants.ts/
 * paymentAccounts.ts) porque isto é sempre lido em ecrãs já online
 * (BlockedPage, SuperAdminPage) — não há necessidade de leitura síncrona.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PaymentSubmission {
  id: string;
  tenantId: string;
  tenantName?: string;
  reference: string;
  note?: string;
  method: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  reviewedAt?: string;
}

type Row = {
  id: string;
  tenant_id: string;
  reference: string;
  note: string | null;
  method: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  tenants?: { name: string } | null;
};

function mapRow(r: Row): PaymentSubmission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenants?.name,
    reference: r.reference,
    note: r.note ?? undefined,
    method: r.method,
    status: r.status as PaymentSubmission['status'],
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at ?? undefined,
  };
}

/** Tenant admin submits a payment reference/proof for their own (blocked) tenant. */
export async function submitPayment(tenantId: string, reference: string, note?: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('payment_submissions').insert({
    tenant_id: tenantId,
    submitted_by: auth.user?.id,
    reference: reference.trim(),
    note: note?.trim() || null,
  });
  if (error) { console.warn('submitPayment failed', error.message); return false; }
  return true;
}

/** Own tenant's submissions, most recent first — used to show pending/resolved status on /blocked. */
export async function fetchSubmissionsForTenant(tenantId: string): Promise<PaymentSubmission[]> {
  const { data, error } = await supabase
    .from('payment_submissions')
    .select('id, tenant_id, reference, note, method, status, created_at, reviewed_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchSubmissionsForTenant failed', error.message); return []; }
  return (data as unknown as Row[]).map(mapRow);
}

/** Every pending submission across all tenants — the Super Admin review queue, oldest first. */
export async function fetchPendingSubmissions(): Promise<PaymentSubmission[]> {
  const { data, error } = await supabase
    .from('payment_submissions')
    .select('id, tenant_id, reference, note, method, status, created_at, reviewed_at, tenants(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) { console.warn('fetchPendingSubmissions failed', error.message); return []; }
  return (data as unknown as Row[]).map(mapRow);
}

/** Super Admin marks a submission as resolved (activated the plan) or dismissed (invalid/duplicate). */
export async function markSubmissionStatus(id: string, status: 'resolved' | 'dismissed'): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('payment_submissions')
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: auth.user?.id })
    .eq('id', id);
  if (error) { console.warn('markSubmissionStatus failed', error.message); return false; }
  return true;
}
