/**
 * Sessões de checkout para a activação automática de pagamentos (Secção 2
 * de docs/spec-automacao-confirmacao-pagamentos.md). RLS já garante que um
 * membro do tenant só cria/lê as suas próprias sessões — ver migração
 * 20260826130000_checkout_sessions.sql.
 */
import { supabase } from '@/integrations/supabase/client';
import { extractFunctionErrorMessage } from '@/lib/functionError';
import type { BillingPlan } from '@/types/restaurant';

export interface CheckoutSession {
  id: string;
  tenantId: string;
  plan: BillingPlan;
  amount: number;
  contactEmail: string;
  contactPhone: string;
  status: 'pending' | 'paid';
  accessCode: string | null;
  transactionId: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
}

interface CheckoutSessionRow {
  id: string;
  tenant_id: string;
  plan: BillingPlan;
  amount: number | string;
  contact_email: string;
  contact_phone: string;
  status: 'pending' | 'paid';
  access_code: string | null;
  transaction_id: string | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
}

function fromRow(row: CheckoutSessionRow): CheckoutSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    plan: row.plan,
    amount: Number(row.amount),
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    accessCode: row.access_code,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
  };
}

/**
 * Normaliza para os últimos 9 dígitos (formato local moçambicano, sem
 * "258"/"+258") — mesma lógica duplicada em supabase/functions/
 * auto-activate-payment/index.ts (Edge Function não importa de src/).
 * Usado para gravar `contact_phone` no mesmo formato em que o `payerPhone`
 * chega extraído da SMS (Secção 4.3), para a comparação ser uma igualdade
 * exacta de strings.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Prefixos reais das operadoras moçambicanas — Vodacom (M-Pesa) 84/85, Movitel (e-Mola) 86/87. */
export const OPERATOR_PHONE_PREFIXES = {
  mpesa: ['84', '85'],
  emola: ['86', '87'],
} as const;

/**
 * Confirma que o número indicado é mesmo da operadora escolhida — evita
 * que o cliente escolha "M-Pesa" mas digite um número Movitel (ou
 * vice-versa), o que faria a correspondência automática nunca encontrar o
 * telefone certo na SMS (Secção 4.3, 3º critério).
 */
export function phoneMatchesOperator(phone: string, operator: keyof typeof OPERATOR_PHONE_PREFIXES): boolean {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 9) return false;
  return OPERATOR_PHONE_PREFIXES[operator].some(prefix => normalized.startsWith(prefix));
}

/**
 * Reaproveita uma sessão pendente já existente para este tenant+plano+valor
 * em vez de criar sempre uma nova — duas sessões pendentes iguais ao mesmo
 * tempo fazem a correspondência automática recuar para revisão manual
 * (Secção 4.3), incluindo o caso trivial de o próprio cliente clicar duas
 * vezes ou abrir a página em duas abas.
 */
export async function getOrCreateCheckoutSession(
  tenantId: string,
  plan: BillingPlan,
  amount: number,
  contactEmail: string,
  contactPhone: string,
): Promise<CheckoutSession> {
  const phone = normalizePhone(contactPhone);
  if (phone.length !== 9) throw new Error('Número de telefone inválido.');

  // Reaproveita por tenant+plano+valor só (não por telefone também) — RLS
  // impede `authenticated` de fazer UPDATE em checkout_sessions (só a Edge
  // Function, com service role, escreve depois da SMS validada), por isso
  // uma sessão reaproveitada mantém o telefone gravado na primeira vez, não
  // o que for passado aqui numa segunda chamada.
  const { data: existing, error: findErr } = await supabase
    .from('checkout_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('plan', plan)
    .eq('amount', amount)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return fromRow(existing as CheckoutSessionRow);

  const { data, error } = await supabase
    .from('checkout_sessions')
    .insert({ tenant_id: tenantId, plan, amount, contact_email: contactEmail, contact_phone: phone })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as CheckoutSessionRow);
}

/**
 * Confirma um `access_code` para o tenant corrente — nunca activa nada por
 * si só (a activação já aconteceu no servidor quando a SMS foi
 * correspondida, Secção 4.4); isto só confirma/dá entrada ao cliente
 * (Secção 5). `null` quando o código é inválido ou a sessão ainda não está
 * `paid`.
 *
 * Verifica o `sessionId` exacto (não só o tenant) — um `access_code` válido
 * de uma sessão paga anterior nunca deve "confirmar com sucesso" a sessão
 * de um plano diferente que o cliente esteja a tentar pagar agora. RLS
 * (`is_tenant_member`) já impede ver sessões de outro tenant de qualquer
 * forma, mesmo sem filtrar `tenant_id` aqui explicitamente.
 */
export async function redeemAccessCode(sessionId: string, code: string): Promise<CheckoutSession | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('checkout_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('access_code', trimmed)
    .eq('status', 'paid')
    .maybeSingle();
  if (error) { console.warn('redeemAccessCode failed', error.message); return null; }
  return data ? fromRow(data as CheckoutSessionRow) : null;
}

/**
 * D4: reenvia o access_code de uma sessão já paga (a mais recente para este
 * tenant+plano+valor), sem gerar um código novo — ver
 * supabase/functions/resend-access-code/index.ts.
 */
export async function resendAccessCode(tenantId: string, plan: BillingPlan, amount: number): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('resend-access-code', { body: { tenantId, plan, amount } });
  if (error) {
    const message = await extractFunctionErrorMessage(error) ?? error.message;
    console.warn('resendAccessCode failed', message);
    return { ok: false, error: message };
  }
  if (!data?.sent) return { ok: false, error: 'Falha desconhecida ao reenviar.' };
  return { ok: true };
}
