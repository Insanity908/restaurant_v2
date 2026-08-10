import { BillingPlan } from '@/types/restaurant';
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';

export const PLANS: Record<BillingPlan, { label: string; months: number; price: number; savings?: string }> = {
  monthly: { label: 'Mensal', months: 1, price: 3600 },
  quarterly: { label: 'Trimestral', months: 3, price: 9000, savings: 'Poupa 17%' },
  semiannual: { label: 'Semestral', months: 6, price: 16000, savings: 'Poupa 26%' },
  annual: { label: 'Anual', months: 12, price: 30000, savings: 'Poupa 31%' },
};

const STRIPE_LINKS_KEY = 'stripe_payment_links';
const STRIPE_PUB_KEY = 'stripe_publishable_key';

export function getStripeLinks(): Record<BillingPlan, string> {
  try {
    return { monthly: '', quarterly: '', semiannual: '', annual: '', ...JSON.parse(localStorage.getItem(STRIPE_LINKS_KEY) || '{}') };
  } catch {
    return { monthly: '', quarterly: '', semiannual: '', annual: '' };
  }
}
export function setStripeLinks(links: Record<BillingPlan, string>) {
  localStorage.setItem(STRIPE_LINKS_KEY, JSON.stringify(links));
  // Guardado num único registo global (system_payment_accounts, id=1) —
  // superadmin escreve, qualquer admin de tenant consegue ler para montar o
  // checkout no seu próprio browser (antes disto era só localStorage, por
  // isso só funcionava no browser onde o superadmin o tinha configurado).
  void cloud('system_payment_accounts').upsert({
    id: 1,
    stripe_link_monthly: links.monthly || null,
    stripe_link_quarterly: links.quarterly || null,
    stripe_link_semiannual: links.semiannual || null,
    stripe_link_annual: links.annual || null,
  }, { onConflict: 'id' }).then(({ error }) => {
    if (error) console.warn('setStripeLinks upsert failed', error.message);
  });
}
export function getStripePublishableKey(): string {
  return localStorage.getItem(STRIPE_PUB_KEY) || '';
}
export function setStripePublishableKey(k: string) {
  if (k) localStorage.setItem(STRIPE_PUB_KEY, k);
  else localStorage.removeItem(STRIPE_PUB_KEY);
  void cloud('system_payment_accounts').upsert({
    id: 1,
    stripe_publishable_key: k || null,
  }, { onConflict: 'id' }).then(({ error }) => {
    if (error) console.warn('setStripePublishableKey upsert failed', error.message);
  });
}

/** Hydrate the local cache from Supabase — call once per session (AuthContext). */
export async function fetchStripeConfig(): Promise<void> {
  const { data, error } = await supabase
    .from('system_payment_accounts')
    .select('stripe_publishable_key, stripe_link_monthly, stripe_link_quarterly, stripe_link_semiannual, stripe_link_annual')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) { if (error) console.warn('fetchStripeConfig failed', error.message); return; }
  if (data.stripe_publishable_key) localStorage.setItem(STRIPE_PUB_KEY, data.stripe_publishable_key);
  else localStorage.removeItem(STRIPE_PUB_KEY);
  const links: Record<BillingPlan, string> = {
    monthly: data.stripe_link_monthly ?? '',
    quarterly: data.stripe_link_quarterly ?? '',
    semiannual: data.stripe_link_semiannual ?? '',
    annual: data.stripe_link_annual ?? '',
  };
  localStorage.setItem(STRIPE_LINKS_KEY, JSON.stringify(links));
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function buildCheckoutUrl(plan: BillingPlan, tenantId: string): string {
  const base = getStripeLinks()[plan];
  if (!base) {
    return `${window.location.origin}/billing/success?plan=${plan}&simulated=1&tenant=${tenantId}`;
  }
  const url = new URL(base);
  url.searchParams.set('client_reference_id', tenantId);
  return url.toString();
}

export function formatMT(n: number): string {
  return `${n.toLocaleString('pt-PT')} MT`;
}
