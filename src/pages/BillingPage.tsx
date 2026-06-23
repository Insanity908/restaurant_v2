import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Copy, RefreshCw, Shield, ArrowUpCircle, TrendingUp } from 'lucide-react';
import { useLicense } from '@/hooks/useLicense';
import { PLANS, formatMT, buildCheckoutUrl, addMonths } from '@/lib/billing';
import { toast } from 'sonner';
import type { BillingPlan } from '@/types/restaurant';

export default function BillingPage() {
  const { tenant, status, daysLeft, refresh } = useLicense();

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

  const totalPaid = useMemo(
    () => (sub.history || []).reduce((s, h) => s + PLANS[h.plan].price, 0),
    [sub.history],
  );

  const copyKey = async () => {
    await navigator.clipboard.writeText(tenant.licenseKey);
    toast.success('Chave copiada');
  };

  const handleSwitch = (plan: BillingPlan) => {
    window.location.href = buildCheckoutUrl(plan, tenant.id);
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

      {/* Plan switcher */}
      <div className="glass rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" /> Trocar / Renovar plano
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {(Object.keys(PLANS) as BillingPlan[]).map(key => {
            const p = PLANS[key];
            const isCurrent = sub.plan === key && status === 'active';
            const newExpiry = addMonths(baseDate, p.months);
            return (
              <div key={key} className={`rounded-xl p-4 border ${isCurrent ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold">{p.label}</h3>
                  {isCurrent && <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px]">ATUAL</Badge>}
                </div>
                <p className="font-heading text-xl font-bold mt-1">{formatMT(p.price)}</p>
                <p className="text-xs text-muted-foreground">{p.months} meses</p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Nova expiração: <strong className="text-foreground">{newExpiry.toLocaleDateString('pt-MZ')}</strong>
                </p>
                <Button
                  size="sm"
                  className="w-full mt-3"
                  variant={isCurrent ? 'outline' : 'default'}
                  onClick={() => handleSwitch(key)}
                >
                  {isCurrent ? 'Renovar' : 'Mudar para este'}
                </Button>
              </div>
            );
          })}
        </div>
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
                  <p className="font-medium">{formatMT(PLANS[h.plan].price)}</p>
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
