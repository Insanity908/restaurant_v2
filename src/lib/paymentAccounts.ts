/**
 * Dados globais de recebimento manual definidos pelo super-admin.
 * Guardados no Supabase (system_payment_accounts, singleton id=1) e espelhados
 * em localStorage para leitura síncrona.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PaymentAccounts {
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  mobileMoneyProvider?: string;
  mobileMoney?: string;
  notes?: string;
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
  void supabase.from('system_payment_accounts').upsert({
    id: 1,
    bank_name: next.bankName ?? null,
    bank_account: next.bankAccount ?? null,
    mobile_money_provider: next.mobileMoneyProvider ?? null,
    mobile_money: next.mobileMoney ?? null,
  }, { onConflict: 'id' }).then(({ error }) => {
    if (error) console.warn('savePaymentAccounts upsert failed', error.message);
  });
  return next;
}

/** Hydrate cache from Supabase. `bankHolder`/`notes` are not persisted server-side yet. */
export async function fetchPaymentAccounts(): Promise<PaymentAccounts> {
  const { data, error } = await supabase
    .from('system_payment_accounts')
    .select('bank_name, bank_account, mobile_money_provider, mobile_money, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) { console.warn('fetchPaymentAccounts failed', error.message); return readCache(); }
  if (!data) return readCache();
  const merged: PaymentAccounts = {
    bankName: data.bank_name ?? undefined,
    bankAccount: data.bank_account ?? undefined,
    mobileMoneyProvider: data.mobile_money_provider ?? undefined,
    mobileMoney: data.mobile_money ?? undefined,
    updatedAt: data.updated_at ?? undefined,
    // Keep locally-only fields from cache.
    bankHolder: readCache().bankHolder,
    notes: readCache().notes,
  };
  writeCache(merged);
  return merged;
}

export function hasAnyPaymentAccounts(p: PaymentAccounts): boolean {
  return !!(p.bankAccount || p.mobileMoney);
}
