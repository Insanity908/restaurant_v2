import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Copy, RefreshCw, Shield, ArrowUpCircle, TrendingUp, Landmark, Smartphone, MessageCircle } from 'lucide-react';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';
import { PLANS, formatMT, addMonths, fetchPlans, buildPlanWhatsAppLink, applyMultiRestaurantDiscount, planTier, BASIC_PLANS, PRO_PLANS } from '@/lib/billing';
import { getPaymentAccounts, hasAnyPaymentAccounts, fetchPaymentAccounts } from '@/lib/paymentAccounts';
import { hasProfessionalSibling } from '@/lib/tenants';
import { toast } from 'sonner';
import type { BillingPlan } from '@/types/restaurant';

export default function BillingPage() {
  const { tenant, status, daysLeft, refresh } = useLicense();
  const { user } = useAuth();
  const [, forceRefresh] = useState(0);
  const [discountEligible, setDiscountEligible] = useState(false);
  useEffect(() => {
    Promise.all([fetchPlans(), fetchPaymentAccounts()])
      .then(() => forceRefresh(v => v + 1))
      .catch(() => { /* keep defaults */ });
  }, []);
  useEffect(() => {
    if (!tenant) { setDiscountEligible(false); return; }
    hasProfessionalSibling(user?.tenantIds ?? [], tenant.id).then(setDiscountEligible).catch(() => setDiscountEligible(false));
  }, [tenant, user?.tenantIds]);

  const totalPaid = useMemo(
    // `h.price` é o snapshot gravado na activação; rows antigas (antes desta
    // coluna existir) não têm — caem para o preço actual como aproximação.
    () => (tenant?.subscription.history || []).reduce((s, h) => s + (h.price ?? PLANS[h.plan].price), 0),
    [tenant?.subscription.history],
  );

  if (!tenant) {
    return (
      <PageShell title="Faturação" subtitle="Sessão inválida">
        <p className="text-muted-foreground">Faça login como gerente para ver a faturação.</p>
      </PageShell>
    );
  }

  const sub = tenant.subscription;
  const planLabel = sub.plan ? PLANS[sub.plan].label : 'Período de teste';
  const statusTone: Record<string, string> = {
    trial: 'bg-primary/15 text-primary border-primary/30',
    active: 'bg-success/15 text-success border-success/30',
    expired: 'bg-destructive/15 text-destructive border-destructive/30',
    blocked: 'bg-destructive/15 text-destructive border-destructive/30',
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(tenant.licenseKey);
    toast.success('Chave copiada');
  };

  const handleSwitch = (plan: BillingPlan) => {
    const whatsapp = getPaymentAccounts().superadminWhatsapp;
    if (!whatsapp) {
      toast.error('O contacto de activação ainda não está configurado. Tente novamente mais tarde.');
      return;
    }
    // Desconto multi-restaurante é exclusivo do Profissional — ver Secção 2.1
    // de docs/spec-automacao-confirmacao-pagamentos.md.
    const eligible = discountEligible && planTier(plan) === 'pro';
    window.open(buildPlanWhatsAppLink(plan, tenant.name, whatsapp, eligible), '_blank');
  };

  const baseDate =
    sub.expiresAt && new Date(sub.expiresAt) > new Date() && sub.status === 'active'
      ? new Date(sub.expiresAt)
      : new Date();

  return (
    <PageShell
      title="Faturação e subscrição"
      subtitle={tenant.name}
      actions={
        <Link to="/pricing"><Button><RefreshCw className="w-4 h-4" />Mudar plano</Button></Link>
      }
    >
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <CreditCard className="w-3.5 h-3.5" /> Plano atual
          </div>
          <p className="font-heading text-xl font-bold">{planLabel}</p>
          <Badge variant="outline" className={`mt-2 ${statusTone[status || 'trial']}`}>{status}</Badge>
        </div>
        <div className="glass rounded-xl p-5">
          <p className="text-xs text-muted-foreground mb-1">Expira em</p>
          <p className="font-heading text-xl font-bold">{sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('pt-MZ') : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{Math.max(0, daysLeft)} dia(s) restantes</p>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Total pago
          </div>
          <p className="font-heading text-xl font-bold">{formatMT(totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">{sub.history?.length || 0} renovação(ões)</p>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Shield className="w-3.5 h-3.5" /> Chave de licença
          </div>
          <code className="block text-xs font-mono break-all">{tenant.licenseKey}</code>
          <Button size="sm" variant="outline" className="mt-2" onClick={copyKey}>
            <Copy className="w-3.5 h-3.5" /> Copiar
          </Button>
        </div>
      </div>

      {sub.blockedByAdmin && (
        <div className="glass rounded-xl p-4 mb-6 border border-destructive/30">
          <p className="font-semibold text-destructive">Conta bloqueada pelo administrador</p>
          <p className="text-sm text-muted-foreground mt-1">{sub.blockReason || 'Contacte o administrador para desbloquear.'}</p>
        </div>
      )}

      {/* Payment accounts (from super-admin) */}
      {(() => {
        const acc = getPaymentAccounts();
        if (!hasAnyPaymentAccounts(acc)) return null;
        return (
          <div className="glass rounded-xl p-5 mb-6 border border-primary/30">
            <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
              <Landmark className="w-4 h-4" />Dados para pagamento manual
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {acc.bankAccount && (
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Landmark className="w-3 h-3" /> Conta bancária</p>
                  {acc.bankName && <p className="font-medium mt-0.5">{acc.bankName}</p>}
                  <p className="font-mono">{acc.bankAccount}</p>
                  {acc.bankHolder && <p className="text-xs text-muted-foreground">Titular: {acc.bankHolder}</p>}
                </div>
              )}
              {acc.mobileMoney && (
                <div className="rounded-lg bg-secondary/40 p-3">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Smartphone className="w-3 h-3" /> Conta móvel</p>
                  {acc.mobileMoneyProvider && <p className="font-medium mt-0.5">{acc.mobileMoneyProvider}</p>}
                  <p className="font-mono">{acc.mobileMoney}</p>
                </div>
              )}
            </div>
            {acc.notes && <p className="text-xs text-muted-foreground mt-3">{acc.notes}</p>}
          </div>
        );
      })()}

      <div className="glass rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" /> Trocar / Renovar plano
          </h2>
        </div>
        {([{ label: 'Básico', plans: BASIC_PLANS }, { label: 'Profissional', plans: PRO_PLANS }] as const).map(({ label, plans }) => (
          <div key={label} className="mb-5 last:mb-0">
            <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {plans.map(key => {
                const p = PLANS[key];
                const isCurrent = sub.plan === key && status === 'active';
                const newExpiry = addMonths(baseDate, p.months);
                // Desconto multi-restaurante é exclusivo do Profissional.
                const planDiscountEligible = discountEligible && planTier(key) === 'pro';
                const finalPrice = applyMultiRestaurantDiscount(p.price, planDiscountEligible);
                return (
                  <div key={key} className={`rounded-xl p-4 border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-heading font-semibold">{p.label}</h3>
                      {isCurrent && <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px]">ATUAL</Badge>}
                    </div>
                    {planDiscountEligible ? (
                      <p className="mt-1">
                        <span className="text-muted-foreground text-xs line-through mr-1.5">{formatMT(p.price)}</span>
                        <span className="font-heading text-xl font-bold">{formatMT(finalPrice)}</span>
                      </p>
                    ) : (
                      <p className="font-heading text-xl font-bold mt-1">{formatMT(p.price)}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{p.months} {p.months === 1 ? 'mês' : 'meses'}</p>
                    {planDiscountEligible && <p className="text-[11px] text-success">-20% multi-restaurante</p>}
                    {p.savings && <p className="text-[11px] text-success mt-1">{p.savings}</p>}
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Nova expiração: <strong className="text-foreground">{newExpiry.toLocaleDateString('pt-MZ')}</strong>
                    </p>
                    <Button
                      size="sm"
                      className="w-full mt-3 gap-1.5"
                      variant={isCurrent ? 'outline' : 'default'}
                      onClick={() => handleSwitch(key)}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> {isCurrent ? 'Renovar' : 'Mudar para este'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-5">
        <h2 className="font-heading font-semibold mb-3">Histórico de renovações</h2>
        {!sub.history || sub.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento registado.</p>
        ) : (
          <div className="space-y-2">
            {[...sub.history].reverse().map((h, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-border/40 last:border-0">
                <div>
                  <p className="font-medium">{PLANS[h.plan].label}</p>
                  <p className="text-xs text-muted-foreground">{new Date(h.paidAt).toLocaleString('pt-MZ')}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatMT(h.price ?? PLANS[h.plan].price)}</p>
                  {h.ref && <p className="text-xs text-muted-foreground">Ref: {h.ref.slice(0, 16)}…</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
