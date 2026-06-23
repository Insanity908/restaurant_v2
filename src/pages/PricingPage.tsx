import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Check, ArrowLeft } from 'lucide-react';
import { PLANS, formatMT, buildCheckoutUrl } from '@/lib/billing';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import type { BillingPlan } from '@/types/restaurant';

export default function PricingPage() {
  const { tenant, daysLeft, status } = useLicense();
  const { user } = useAuth();

  const subscribe = (plan: BillingPlan) => {
    if (!tenant) {
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }
    const url = buildCheckoutUrl(plan, tenant.id);
    window.location.href = url;
  };

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
            Está em <strong>período de teste</strong>. Restam <strong className="text-primary">{Math.max(0, daysLeft)} dia(s)</strong>.
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

      <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
        {(Object.keys(PLANS) as BillingPlan[]).map(key => {
          const p = PLANS[key];
          const highlight = key === 'semiannual';
          return (
            <div key={key} className={`glass-strong rounded-2xl p-6 flex flex-col ${highlight ? 'border-2 border-primary' : ''}`}>
              {highlight && <span className="text-xs text-primary font-medium mb-2">MAIS POPULAR</span>}
              <h3 className="font-heading text-xl font-bold">{p.label}</h3>
              <div className="mt-3">
                <span className="font-heading text-4xl font-bold">{formatMT(p.price)}</span>
                <span className="text-muted-foreground text-sm"> / {p.months} meses</span>
              </div>
              {p.savings && <span className="text-xs text-success mt-1">{p.savings}</span>}
              <ul className="mt-5 space-y-2 text-sm flex-1">
                <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> {p.months} meses de acesso completo</li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Utilizadores ilimitados</li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Suporte por email</li>
                <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Atualizações incluídas</li>
              </ul>
              <Button className="w-full mt-6" onClick={() => subscribe(key)}>Subscrever</Button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-8 max-w-xl mx-auto">
        Pagamento processado via Stripe. Após pagar com sucesso, a sua subscrição é ativada automaticamente.
        Em caso de dificuldades, contacte o administrador.
      </p>
    </PageShell>
  );
}
