import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, LogOut, Coffee, Landmark, Smartphone, Send, Clock, CreditCard } from 'lucide-react';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';
import { tenantStore } from '@/lib/tenants';
import { fetchPaymentAccounts, hasAnyPaymentAccounts, type PaymentAccounts } from '@/lib/paymentAccounts';
import { submitPayment, fetchSubmissionsForTenant, type PaymentSubmission } from '@/lib/paymentSubmissions';
import { toast } from 'sonner';

export default function BlockedPage() {
  const { tenant } = useLicense();
  const { user, logout, switchTenant } = useAuth();
  const navigate = useNavigate();
  const sub = tenant?.subscription;

  const [accounts, setAccounts] = useState<PaymentAccounts>({});
  const [pending, setPending] = useState<PaymentSubmission | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    void Promise.all([
      fetchPaymentAccounts(),
      fetchSubmissionsForTenant(tenant.id),
    ]).then(([acc, submissions]) => {
      setAccounts(acc);
      setPending(submissions.find(s => s.status === 'pending') ?? null);
      setLoaded(true);
    });
  }, [tenant?.id]);

  const otherTenants = (user?.tenantIds || [])
    .filter(id => id !== tenant?.id)
    .map(id => tenantStore.getById(id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const send = async () => {
    if (!tenant?.id || !reference.trim()) return;
    setSubmitting(true);
    const ok = await submitPayment(tenant.id, reference.trim(), note.trim() || undefined);
    setSubmitting(false);
    if (!ok) { toast.error('Não foi possível enviar o comprovativo'); return; }
    toast.success('Comprovativo enviado — aguarde a confirmação');
    setPending({ id: 'local', tenantId: tenant.id, reference: reference.trim(), note: note.trim() || undefined, method: 'manual', status: 'pending', createdAt: new Date().toISOString() });
    setReference('');
    setNote('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-destructive/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/15 flex items-center justify-center">
          <Lock className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Acesso bloqueado</h1>
        <p className="text-sm text-muted-foreground">
          {sub?.blockReason || 'A sua conta foi bloqueada pelo administrador. Contacte-o para regularizar.'}
        </p>

        {user?.role === 'admin' && (
          <Button className="w-full" onClick={() => navigate('/pricing')}>
            <CreditCard className="w-4 h-4" />Ver planos e pagar
          </Button>
        )}

        {otherTenants.length > 0 && (
          <div className="text-left rounded-xl border border-border/60 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Mudar para outro restaurante</p>
            {otherTenants.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTenant(t.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-secondary/60 text-left"
              >
                <Coffee className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm truncate">{t.name}</span>
              </button>
            ))}
          </div>
        )}

        {loaded && hasAnyPaymentAccounts(accounts) && (
          <div className="text-left rounded-xl border border-primary/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Landmark className="w-3.5 h-3.5" /> Alternativa: transferência bancária/manual
            </p>
            <p className="text-[11px] text-muted-foreground">
              Para pagar por e-Mola/M-Pesa com activação automática, use "Ver planos e pagar" acima.
            </p>
            {accounts.bankAccount && (
              <div className="text-xs">
                {accounts.bankName && <p className="font-medium">{accounts.bankName}</p>}
                <p className="font-mono">{accounts.bankAccount}</p>
                {accounts.bankHolder && <p className="text-muted-foreground">Titular: {accounts.bankHolder}</p>}
              </div>
            )}
            {accounts.mobileMoney && (
              <div className="text-xs flex items-start gap-1">
                <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  {accounts.mobileMoneyProvider && <p className="font-medium">{accounts.mobileMoneyProvider}</p>}
                  <p className="font-mono">{accounts.mobileMoney}</p>
                </div>
              </div>
            )}
            {accounts.notes && <p className="text-xs text-muted-foreground">{accounts.notes}</p>}
          </div>
        )}

        {loaded && (
          pending ? (
            <div className="text-left rounded-xl border border-border/60 p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Comprovativo enviado</p>
                <p className="text-xs text-muted-foreground">
                  Referência {pending.reference} · {new Date(pending.createdAt).toLocaleString('pt-MZ')} — a aguardar confirmação.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-left rounded-xl border border-border/60 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Já pagou? Envie a referência</p>
              <div className="space-y-1.5">
                <Label htmlFor="payment-reference" className="text-xs">Referência</Label>
                <Input id="payment-reference" value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex: código da transação" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-note" className="text-xs">Nota (opcional)</Label>
                <Input id="payment-note" value={note} onChange={e => setNote(e.target.value)} />
              </div>
              <Button size="sm" className="w-full" onClick={send} disabled={!reference.trim() || submitting}>
                <Send className="w-3.5 h-3.5" />{submitting ? 'A enviar…' : 'Enviar comprovativo'}
              </Button>
            </div>
          )
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button variant="outline" onClick={handleLogout}><LogOut className="w-4 h-4" />Sair</Button>
        </div>
      </div>
    </div>
  );
}
