import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Coffee, AlertTriangle } from 'lucide-react';
import { tenantStore } from '@/lib/tenants';
import { useLicense } from '@/hooks/useLicense';
import { getStripePublishableKey } from '@/lib/billing';
import type { BillingPlan } from '@/types/restaurant';

export default function BillingSuccessPage() {
  const [params] = useSearchParams();
  const { tenant, syncFromServer } = useLicense();
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [simulated, setSimulated] = useState(false);

  useEffect(() => {
    const plan = params.get('plan') as BillingPlan | null;
    const sessionId = params.get('session_id') || undefined;
    const isSimulated = !!params.get('simulated') || !sessionId;
    setSimulated(isSimulated);
    if (!plan || !tenant) return;
    // Activation happens server-side (edge function) and is restricted to the
    // platform super-admin, who confirms the payment reference.
    const ref = sessionId || `sim-${Date.now()}`;
    let cancelled = false;
    tenantStore.activatePlan(tenant.id, plan, ref).then(res => {
      if (cancelled) return;
      if (res.ok) { setDone(true); void syncFromServer(); }
      else setPending(res.error || 'Aguarda confirmação do administrador.');
    });
    return () => { cancelled = true; };
  }, [params, tenant, syncFromServer]);


  const hasPubKey = !!getStripePublishableKey();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-success/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-success" />
        </div>
        <h1 className="font-heading text-2xl font-bold">
          {pending ? 'Pagamento registado' : 'Pagamento confirmado!'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {done
            ? 'A sua subscrição foi ativada com sucesso. Bem-vindo de volta!'
            : pending
              ? 'A ativação do plano é confirmada pelo administrador da plataforma após validação do pagamento.'
              : 'A processar a sua subscrição...'}
        </p>
        {pending && <p className="text-[11px] text-muted-foreground">{pending}</p>}

        {simulated && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-left text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-primary font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />Modo simulado
            </div>
            <p className="text-muted-foreground">
              {hasPubKey
                ? 'Esta sessão não tinha session_id Stripe. Para activação garantida via webhook, é necessário backend .'
                : 'Stripe Payment Links não configurados. Configure em Definições → Faturação para activação real.'}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2 pt-2">
          <Link to="/"><Button className="w-full"><Coffee className="w-4 h-4" />Ir para o sistema</Button></Link>
          <Link to="/billing"><Button variant="outline" className="w-full">Ver faturação</Button></Link>
        </div>
      </div>
    </div>
  );
}
