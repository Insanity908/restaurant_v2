import { BillingPlan } from '@/types/restaurant';

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
}
export function getStripePublishableKey(): string {
  return localStorage.getItem(STRIPE_PUB_KEY) || '';
}
export function setStripePublishableKey(k: string) {
  if (k) localStorage.setItem(STRIPE_PUB_KEY, k);
  else localStorage.removeItem(STRIPE_PUB_KEY);
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
