/**
 * Registo de tentativas de correspondência SMS → sessão de checkout que
 * falharam (Secção 4.5/D5 de docs/spec-automacao-confirmacao-pagamentos.md),
 * escrito só pela Edge Function `auto-activate-payment` (service role) —
 * aqui se lê e (desde 28/08/2026) se apaga, para revisão manual em
 * SuperAdminPage. O superadmin decide a acção fora da app (ex. activar o
 * plano à mão via "Ativar plano" já existente) e depois apaga a entrada já
 * revista.
 */
import { supabase } from '@/integrations/supabase/client';

export type CheckoutMatchFailureReason = 'unparseable' | 'unknown_plan' | 'no_match';

export interface CheckoutMatchFailure {
  id: string;
  reason: CheckoutMatchFailureReason;
  rawText: string;
  extracted: { transactionId?: string; amount?: number; planCode?: string; payerPhone?: string } | null;
  createdAt: string;
}

type Row = {
  id: string;
  reason: string;
  raw_text: string;
  extracted: CheckoutMatchFailure['extracted'];
  created_at: string;
};

function mapRow(r: Row): CheckoutMatchFailure {
  return {
    id: r.id,
    reason: r.reason as CheckoutMatchFailureReason,
    rawText: r.raw_text,
    extracted: r.extracted,
    createdAt: r.created_at,
  };
}

/** Últimas tentativas falhadas, mais recente primeiro — superadmin only (RLS). */
export async function fetchCheckoutMatchFailures(limit = 50): Promise<CheckoutMatchFailure[]> {
  const { data, error } = await supabase
    .from('checkout_match_failures')
    .select('id, reason, raw_text, extracted, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('fetchCheckoutMatchFailures failed', error.message); return []; }
  return (data as unknown as Row[]).map(mapRow);
}

/** Super Admin apaga um registo já revisto. */
export async function deleteCheckoutMatchFailure(id: string): Promise<boolean> {
  const { error } = await supabase.from('checkout_match_failures').delete().eq('id', id);
  if (error) { console.warn('deleteCheckoutMatchFailure failed', error.message); return false; }
  return true;
}
