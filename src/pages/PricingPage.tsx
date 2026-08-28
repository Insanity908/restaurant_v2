import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Check, ArrowLeft, MessageCircle, Zap } from 'lucide-react';
import { PLANS, formatMT, fetchPlans, buildPlanWhatsAppLink, applyMultiRestaurantDiscount, planTier, BASIC_PLANS, PRO_PLANS } from '@/lib/billing';
import { getPaymentAccounts, fetchPaymentAccounts } from '@/lib/paymentAccounts';
import { hasProfessionalSibling } from '@/lib/tenants';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import AutoPaymentDialog from '@/components/AutoPaymentDialog';
import type { BillingPlan } from '@/types/restaurant';

export default function PricingPage() {
  const { tenant, daysLeft, status } = useLicense();
  const { user } = useAuth();
  const [, forceRefresh] = useState(0);
  const [discountEligible, setDiscountEligible] = useState(false);
  const [autoPaymentPlan, setAutoPaymentPlan] = useState<BillingPlan | null>(null);
  useEffect(() => {
    Promise.all([fetchPlans(), fetchPaymentAccounts()])
      .then(() => forceRefresh(v => v + 1))
      .catch(() => { /* keep defaults */ });
  }, []);
  useEffect(() => {
    if (!tenant) { setDiscountEligible(false); return; }
    hasProfessionalSibling(user?.tenantIds ?? [], tenant.id).then(setDiscountEligible).catch(() => setDiscountEligible(false));
  }, [tenant, user?.tenantIds]);

  const subscribe = (plan: BillingPlan) => {
    if (!tenant) {
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }
    const whatsapp = getPaymentAccounts().superadminWhatsapp;
    if (!whatsapp) {
      toast.error('O contacto de activação ainda não está configurado. Tente novamente mais tarde.');
      return;
    }
    // Desconto multi-restaurante é exclusivo do Profissional — ver Secção 2.1
    // de docs/spec-automacao-confirmacao-pagamentos.md (não é compatível com
    // o QR fixo pré-gerado por plano se aplicado também ao Básico).
    const eligible = discountEligible && planTier(plan) === 'pro';
    window.open(buildPlanWhatsAppLink(plan, tenant.name, whatsapp, eligible), '_blank');
  };

  const openAutoPayment = (plan: BillingPlan) => {
    if (!tenant) { toast.error('Sessão expirada. Faça login novamente.'); return; }
    if (!user?.email) { toast.error('A sua conta não tem um email associado — contacte o administrador.'); return; }
    setAutoPaymentPlan(plan);
  };

  const autoPaymentDiscounted = autoPaymentPlan ? discountEligible && planTier(autoPaymentPlan) === 'pro' : false;
  const autoPaymentAmount = autoPaymentPlan ? applyMultiRestaurantDiscount(PLANS[autoPaymentPlan].price, autoPaymentDiscounted) : 0;

  const tiers: { key: 'basic' | 'pro'; label: string; plans: BillingPlan[] }[] = [
    { key: 'basic', label: 'Básico', plans: BASIC_PLANS },
    { key: 'pro', label: 'Profissional', plans: PRO_PLANS },
  ];

  return (
    <PageShell
      title="Pacotes de subscrição"
      subtitle={tenant ? `${tenant.name} • Estado: ${status}` : 'Escolha o seu pacote'}
      actions={
        user ? (
          <Link to="/billing"><Button variant="outline"><ArrowLeft className="w-4 h-4" />Voltar à faturação</Button></Link>
        ) : null
      }
    >
      {status === 'trial' && (
        <div className="glass rounded-xl p-4 mb-6 border border-primary/30 text-center">
          <p className="text-sm">
            Está em <strong>período de teste</strong> (acesso completo). Restam <strong className="text-primary">{Math.max(0, daysLeft)} dia(s)</strong>.
          </p>
        </div>
      )}
      {(status === 'expired' || status === 'blocked') && (
        <div className="glass rounded-xl p-4 mb-6 border border-destructive/30 text-center">
          <p className="text-sm text-destructive">
            A sua subscrição está <strong>{status === 'blocked' ? 'bloqueada' : 'expirada'}</strong>. Escolha um pacote para continuar.
          </p>
        </div>
      )}

      {tiers.map(({ key, label, plans }) => (
        <section key={key} className="mb-10">
          <h2 className="font-heading text-2xl font-bold text-center mb-1">{label}</h2>
          <p className="text-center text-xs text-muted-foreground mb-6">
            {key === 'basic' ? 'Para começar — mesas e funcionários limitados.' : 'Sem limites, com fidelização e pedido pelo cliente.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {plans.map(planKey => {
              const p = PLANS[planKey];
              const highlight = key === 'pro' && planKey === 'quarterly';
              const isCurrent = tenant?.subscription.plan === planKey && status === 'active';
              // Desconto multi-restaurante é exclusivo do Profissional.
              const planDiscountEligible = discountEligible && key === 'pro';
              const finalPrice = applyMultiRestaurantDiscount(p.price, planDiscountEligible);
              return (
                <div key={planKey} className={`glass-strong rounded-2xl p-6 flex flex-col ${highlight ? 'border-2 border-primary' : ''}`}>
                  {highlight && <span className="text-xs text-primary font-medium mb-2">MAIS POPULAR</span>}
                  {isCurrent && <span className="text-xs text-success font-medium mb-2">PLANO ATUAL</span>}
                  {planDiscountEligible && <span className="text-xs text-success font-medium mb-2">-20% MULTI-RESTAURANTE</span>}
                  <h3 className="font-heading text-xl font-bold">{p.label}</h3>
                  <div className="mt-3">
                    {planDiscountEligible && (
                      <span className="text-muted-foreground text-sm line-through mr-2">{formatMT(p.price)}</span>
                    )}
                    <span className="font-heading text-3xl font-bold">{formatMT(finalPrice)}</span>
                    <span className="text-muted-foreground text-sm block">{p.months} {p.months === 1 ? 'mês' : 'meses'}</span>
                  </div>
                  {p.savings && <span className="text-xs text-success mt-1">{p.savings}</span>}
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    {p.features.map(f => (
                      <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-success shrink-0" /> {f}</li>
                    ))}
                  </ul>
                  <div className="mt-6 space-y-2">
                    <Button className="w-full gap-2" variant="outline" onClick={() => openAutoPayment(planKey)}>
                      <Zap className="w-4 h-4" /> Pagamento automático
                    </Button>
                    <Button className="w-full gap-2" variant="ghost" onClick={() => subscribe(planKey)}>
                      <MessageCircle className="w-4 h-4" /> Pedir por WhatsApp
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-muted-foreground mt-2 max-w-xl mx-auto">
        "Pagamento automático" activa o plano assim que confirmarmos o pagamento, sem intervenção manual.
        "Pedir por WhatsApp" abre uma conversa a pedir a activação à mão. Em caso de dificuldades, contacte o administrador.
      </p>

      {tenant && autoPaymentPlan && (
        <AutoPaymentDialog
          open
          onOpenChange={open => { if (!open) setAutoPaymentPlan(null); }}
          tenantId={tenant.id}
          plan={autoPaymentPlan}
          amount={autoPaymentAmount}
          contactEmail={user?.email ?? ''}
          contactPhone={user?.phone ?? ''}
        />
      )}
    </PageShell>
  );
}
