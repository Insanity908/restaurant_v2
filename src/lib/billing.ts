import { BillingPlan } from '@/types/restaurant';
import { supabase } from '@/integrations/supabase/client';

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

/** Desconto num restaurante adicional quando a conta já tem outro no Profissional (ver hasProfessionalSibling em src/lib/tenants.ts). */
export const MULTI_RESTAURANT_DISCOUNT = 0.2;

export function applyMultiRestaurantDiscount(price: number, eligible: boolean): number {
  return eligible ? Math.round(price * (1 - MULTI_RESTAURANT_DISCOUNT)) : price;
}

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

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function formatMT(n: number): string {
  return `${n.toLocaleString('pt-PT')} MT`;
}

/** Abre uma conversa de WhatsApp com o superadmin a pedir activação do plano — pagamento manual, sem checkout automático. */
export function buildPlanWhatsAppLink(plan: BillingPlan, tenantName: string, superadminWhatsapp: string, discountEligible = false): string {
  const p = PLANS[plan];
  const digits = superadminWhatsapp.replace(/\D/g, '');
  const waPhone = digits.startsWith('258') ? digits : `258${digits}`;
  const finalPrice = applyMultiRestaurantDiscount(p.price, discountEligible);
  const priceText = discountEligible
    ? `${formatMT(finalPrice)}, com 20% de desconto por já ter outro restaurante Profissional — preço normal ${formatMT(p.price)}`
    : formatMT(p.price);
  const text = encodeURIComponent(
    `Olá! Quero ativar o plano ${p.label} (${planTier(plan) === 'basic' ? 'Básico' : 'Profissional'}, ${priceText}) para o restaurante "${tenantName}".`,
  );
  return `https://wa.me/${waPhone}?text=${text}`;
}
