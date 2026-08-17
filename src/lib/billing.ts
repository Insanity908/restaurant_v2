import { BillingPlan } from '@/types/restaurant';
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';

export interface PlanConfig {
  label: string;
  months: number;
  price: number;
  savings?: string;
  features: string[];
}

const PRO_FEATURES = ['Mesas e funcionários ilimitados', 'Programa de fidelização', 'Pedido pelo cliente (QR / entrega)', 'Relatórios completos com exportação CSV/PDF'];
const BASIC_FEATURES = ['Até 10 mesas', 'Até 5 funcionários', 'Suporte por email'];

/** Nível do plano — codificado no próprio valor (prefixo "basic-"), sem coluna à parte. */
export function planTier(plan: BillingPlan | null | undefined): 'basic' | 'pro' {
  return plan?.startsWith('basic-') ? 'basic' : 'pro';
}
export const BASIC_PLANS: BillingPlan[] = ['basic-monthly', 'basic-quarterly', 'basic-semiannual', 'basic-annual'];
export const PRO_PLANS: BillingPlan[] = ['monthly', 'quarterly', 'semiannual', 'annual'];
/** Restrições reais do nível Básico — ver useLicense() e os pontos que as aplicam. */
export const BASIC_LIMITS = { maxTables: 10, maxStaff: 5 };

// Valores por omissão (usados até `fetchPlans()` resolver, ou se a leitura
// falhar) — mutados no próprio local pelo `fetchPlans`/`savePlans` abaixo,
// em vez de o módulo exportar uma nova referência, para que todos os sítios
// que já importam `PLANS` directamente (Landing, Pricing, Billing,
// SuperAdmin) vejam os valores actualizados sem precisarem de mudar nada.
export const PLANS: Record<BillingPlan, PlanConfig> = {
  monthly: { label: 'Mensal', months: 1, price: 3600, features: PRO_FEATURES },
  quarterly: { label: 'Trimestral', months: 3, price: 9000, savings: 'Poupa 17%', features: PRO_FEATURES },
  semiannual: { label: 'Semestral', months: 6, price: 16000, savings: 'Poupa 26%', features: PRO_FEATURES },
  annual: { label: 'Anual', months: 12, price: 30000, savings: 'Poupa 31%', features: PRO_FEATURES },
  'basic-monthly': { label: 'Mensal', months: 1, price: 2200, features: BASIC_FEATURES },
  'basic-quarterly': { label: 'Trimestral', months: 3, price: 5500, savings: 'Poupa 17%', features: BASIC_FEATURES },
  'basic-semiannual': { label: 'Semestral', months: 6, price: 9800, savings: 'Poupa 26%', features: BASIC_FEATURES },
  'basic-annual': { label: 'Anual', months: 12, price: 18300, savings: 'Poupa 31%', features: BASIC_FEATURES },
};

/** Hydrate `PLANS` in place from Supabase — call on app/page mount. Falha silenciosamente, mantendo os valores por omissão. */
export async function fetchPlans(): Promise<void> {
  try {
    const { data, error } = await supabase.from('billing_plans').select('id, label, months, price, savings, features');
    if (error || !data) { if (error) console.warn('fetchPlans failed', error.message); return; }
    data.forEach(row => {
      const plan = row.id as BillingPlan;
      if (!PLANS[plan]) return;
      PLANS[plan] = {
        label: row.label,
        months: row.months,
        price: Number(row.price),
        savings: row.savings ?? undefined,
        features: Array.isArray(row.features) ? (row.features as string[]) : PLANS[plan].features,
      };
    });
  } catch (err) {
    console.warn('fetchPlans failed', (err as Error).message);
  }
}

/** Superadmin only (enforced by RLS) — persists all 4 plans and updates the local cache immediately. */
export async function savePlans(plans: Record<BillingPlan, PlanConfig>): Promise<boolean> {
  const rows = (Object.keys(plans) as BillingPlan[]).map(id => ({
    id,
    label: plans[id].label,
    months: plans[id].months,
    price: plans[id].price,
    savings: plans[id].savings || null,
    features: plans[id].features,
  }));
  const { error } = await supabase.from('billing_plans').upsert(rows as never, { onConflict: 'id' });
  if (error) { console.warn('savePlans failed', error.message); return false; }
  (Object.keys(plans) as BillingPlan[]).forEach(id => { PLANS[id] = plans[id]; });
  return true;
}

const STRIPE_LINKS_KEY = 'stripe_payment_links';
const STRIPE_PUB_KEY = 'stripe_publishable_key';

const EMPTY_LINKS: Record<BillingPlan, string> = {
  monthly: '', quarterly: '', semiannual: '', annual: '',
  'basic-monthly': '', 'basic-quarterly': '', 'basic-semiannual': '', 'basic-annual': '',
};

export function getStripeLinks(): Record<BillingPlan, string> {
  try {
    return { ...EMPTY_LINKS, ...JSON.parse(localStorage.getItem(STRIPE_LINKS_KEY) || '{}') };
  } catch {
    return EMPTY_LINKS;
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
    ...EMPTY_LINKS,
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

/** Abre uma conversa de WhatsApp com o superadmin a pedir activação do plano — pagamento manual, sem checkout automático. */
export function buildPlanWhatsAppLink(plan: BillingPlan, tenantName: string, superadminWhatsapp: string): string {
  const p = PLANS[plan];
  const digits = superadminWhatsapp.replace(/\D/g, '');
  const waPhone = digits.startsWith('258') ? digits : `258${digits}`;
  const text = encodeURIComponent(
    `Olá! Quero ativar o plano ${p.label} (${planTier(plan) === 'basic' ? 'Básico' : 'Profissional'}, ${formatMT(p.price)}) para o restaurante "${tenantName}".`,
  );
  return `https://wa.me/${waPhone}?text=${text}`;
}
