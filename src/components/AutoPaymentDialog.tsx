import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, KeyRound, Loader2, RotateCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, formatMT, planCode } from '@/lib/billing';
import { getPaymentAccounts } from '@/lib/paymentAccounts';
import { getOrCreateCheckoutSession, redeemAccessCode, resendAccessCode } from '@/lib/checkoutSessions';
import { useLicense } from '@/hooks/useLicense';
import type { BillingPlan } from '@/types/restaurant';

interface AutoPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  plan: BillingPlan;
  amount: number;
  discounted: boolean;
  contactEmail: string;
}

/**
 * Secção 3/5 (docs/spec-automacao-confirmacao-pagamentos.md): cria/reaproveita
 * a sessão de checkout, mostra os dados para pagar (texto copiável — Secção
 * 3.2, sempre a base de referência; ainda sem imagem de QR) e o campo para
 * confirmar com o `access_code` recebido por email. A activação em si já
 * aconteceu no servidor quando a SMS foi correspondida (4.4) — isto só
 * confirma/dá entrada, por isso um `refresh()` chega para reflectir o
 * estado (Realtime já devia ter actualizado sozinho, isto só garante).
 */
export default function AutoPaymentDialog({ open, onOpenChange, tenantId, plan, amount, discounted, contactEmail }: AutoPaymentDialogProps) {
  const { refresh } = useLicense();
  const [creating, setCreating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  // Chave da combinação já pedida/em curso — evita criar uma segunda sessão
  // pendente igual (Secção 4.3: duas sessões pendentes do mesmo plano+valor
  // bloqueiam a correspondência automática) se este efeito disparar mais do
  // que uma vez para o mesmo "open" — ex. `onOpenChange` muda de referência
  // a cada render do pai, e não está nas deps por causa disto mesmo.
  const requestedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) { setSessionId(null); setCode(''); requestedKeyRef.current = null; return; }
    const key = `${tenantId}:${plan}:${amount}`;
    if (requestedKeyRef.current === key) return;
    requestedKeyRef.current = key;
    setCreating(true);
    getOrCreateCheckoutSession(tenantId, plan, amount, contactEmail)
      .then(session => setSessionId(session.id))
      .catch(err => {
        requestedKeyRef.current = null;
        toast.error('Não foi possível iniciar o pagamento. Tente novamente.');
        console.warn('getOrCreateCheckoutSession failed', err);
        onOpenChange(false);
      })
      .finally(() => setCreating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId, plan, amount, contactEmail]);

  const accounts = getPaymentAccounts();
  const code_ = planCode(plan, discounted);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const confirm = async () => {
    if (!code.trim() || !sessionId) return;
    setVerifying(true);
    const session = await redeemAccessCode(sessionId, code).catch(() => null);
    setVerifying(false);
    if (!session) {
      toast.error('Código inválido, ou não corresponde a este plano/pagamento.');
      return;
    }
    refresh();
    toast.success('Plano activado! Obrigado.');
    onOpenChange(false);
  };

  const resend = async () => {
    setResending(true);
    const result = await resendAccessCode(tenantId, plan, amount);
    setResending(false);
    if (!result.ok) {
      toast.error(result.error ?? 'Ainda não encontrámos um pagamento confirmado para este plano.');
      return;
    }
    toast.success(`Código reenviado para ${contactEmail}.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagamento automático — {PLANS[plan].label}</DialogTitle>
        </DialogHeader>

        {creating || !sessionId ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> A preparar…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/40 p-3 text-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Valor a pagar</span>
                <span className="font-heading font-bold">{formatMT(amount)}</span>
              </div>
              {accounts.mobileMoney && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><Smartphone className="w-3 h-3" />{accounts.mobileMoneyProvider || 'Nº de pagamento'}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{accounts.mobileMoney}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(accounts.mobileMoney!, 'Número')}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground text-xs">Conteúdo / referência</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold">{code_}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(code_, 'Código')}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pague o valor exacto acima usando o "Conteúdo"/referência indicado. Assim que confirmarmos o pagamento,
              enviamos um código de acesso para <strong className="text-foreground">{contactEmail}</strong> — introduza-o abaixo para confirmar.
            </p>

            <div className="pt-2 border-t border-border space-y-2">
              <Label htmlFor="access-code">Código de acesso</Label>
              <div className="flex gap-2">
                <Input
                  id="access-code"
                  placeholder="Ex: 1C1CEC0B7C"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="font-mono uppercase"
                />
                <Button onClick={confirm} disabled={!code.trim() || verifying}>
                  <KeyRound className="w-4 h-4" />{verifying ? 'A confirmar…' : 'Confirmar'}
                </Button>
              </div>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={resend} disabled={resending}>
                <RotateCw className="w-3 h-3" />{resending ? 'A reenviar…' : 'Já pagou mas não recebeu o código? Reenviar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
