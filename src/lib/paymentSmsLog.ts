/**
 * Registo de toda a SMS de pagamento processada pela activação automática
 * (Secção 4/D5 de docs/spec-automacao-confirmacao-pagamentos.md) — tanto as
 * que activaram um plano com sucesso (`matched`) como as que não puderam
 * ser correspondidas com confiança, escrito só pela Edge Function
 * `auto-activate-payment` (service role). Lido (e, desde 28/08/2026,
 * apagado depois de revisto) só pelo superadmin em SuperAdminPage.
 */
import { supabase } from '@/integrations/supabase/client';

export type PaymentSmsReason = 'matched' | 'unparseable' | 'unknown_plan' | 'no_match' | 'ambiguous_amount';

export interface PaymentSmsLogEntry {
  id: string;
  reason: PaymentSmsReason;
  rawText: string;
  extracted: {
    transactionId?: string;
    amount?: number;
    planCode?: string;
    plan?: string;
    payerPhoneRaw?: string;
    normalizedPayerPhone?: string;
    provider?: string;
    tenantName?: string;
    contactEmail?: string;
    planLabel?: string;
  } | null;
  createdAt: string;
}

type Row = {
  id: string;
  reason: string;
  raw_text: string;
  extracted: PaymentSmsLogEntry['extracted'];
  created_at: string;
};

function mapRow(r: Row): PaymentSmsLogEntry {
  return {
    id: r.id,
    reason: r.reason as PaymentSmsReason,
    rawText: r.raw_text,
    extracted: r.extracted,
    createdAt: r.created_at,
  };
}

/** Últimas mensagens processadas, mais recente primeiro — superadmin only (RLS). */
export async function fetchPaymentSmsLog(limit = 100): Promise<PaymentSmsLogEntry[]> {
  const { data, error } = await supabase
    .from('payment_sms_log')
    .select('id, reason, raw_text, extracted, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.warn('fetchPaymentSmsLog failed', error.message); return []; }
  return (data as unknown as Row[]).map(mapRow);
}

/** Super Admin apaga um registo já revisto. */
export async function deletePaymentSmsLogEntry(id: string): Promise<boolean> {
  const { error } = await supabase.from('payment_sms_log').delete().eq('id', id);
  if (error) { console.warn('deletePaymentSmsLogEntry failed', error.message); return false; }
  return true;
}
