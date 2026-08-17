/**
 * Dados globais de recebimento manual definidos pelo super-admin.
 * Guardados no Supabase (system_payment_accounts, singleton id=1) e espelhados
 * em localStorage para leitura síncrona.
 */
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';

export interface PaymentAccounts {
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  mobileMoneyProvider?: string;
  mobileMoney?: string;
  notes?: string;
  /** Número de WhatsApp do superadmin — usado para pedir activação de planos. */
  superadminWhatsapp?: string;
  updatedAt?: string;
}

const KEY = 'system_payment_accounts';

function readCache(): PaymentAccounts {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeCache(p: PaymentAccounts) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota */ }
}

export function getPaymentAccounts(): PaymentAccounts {
  return readCache();
}

export function savePaymentAccounts(p: PaymentAccounts): PaymentAccounts {
  const next: PaymentAccounts = { ...p, updatedAt: new Date().toISOString() };
  writeCache(next);
  void cloud('system_payment_accounts').upsert({
    id: 1,
    bank_name: next.bankName ?? null,
    bank_account: next.bankAccount ?? null,
    bank_holder: next.bankHolder ?? null,
    notes: next.notes ?? null,
    mobile_money_provider: next.mobileMoneyProvider ?? null,
    mobile_money: next.mobileMoney ?? null,
    superadmin_whatsapp: next.superadminWhatsapp ?? null,
  }, { onConflict: 'id' }).then(({ error }) => {
    if (error) console.warn('savePaymentAccounts upsert failed', error.message);
  });
  return next;
}

/** Hydrate cache from Supabase. */
export async function fetchPaymentAccounts(): Promise<PaymentAccounts> {
  let data: Record<string, unknown> | null = null;
  try {
    const res = await supabase
      .from('system_payment_accounts')
      .select('bank_name, bank_account, bank_holder, notes, mobile_money_provider, mobile_money, superadmin_whatsapp, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (res.error) { console.warn('fetchPaymentAccounts failed', res.error.message); return readCache(); }
    data = res.data;
  } catch (err) {
    console.warn('fetchPaymentAccounts failed', (err as Error).message);
    return readCache();
  }
  if (!data) return readCache();
  const merged: PaymentAccounts = {
    bankName: (data.bank_name as string) ?? undefined,
    bankAccount: (data.bank_account as string) ?? undefined,
    bankHolder: (data.bank_holder as string) ?? undefined,
    notes: (data.notes as string) ?? undefined,
    mobileMoneyProvider: (data.mobile_money_provider as string) ?? undefined,
    mobileMoney: (data.mobile_money as string) ?? undefined,
    superadminWhatsapp: (data.superadmin_whatsapp as string) ?? undefined,
    updatedAt: (data.updated_at as string) ?? undefined,
  };
  writeCache(merged);
  return merged;
}

export function hasAnyPaymentAccounts(p: PaymentAccounts): boolean {
  return !!(p.bankAccount || p.mobileMoney);
}
