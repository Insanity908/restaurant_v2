import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, KeyRound, Loader2, RotateCw, Smartphone, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { PLANS, formatMT } from '@/lib/billing';
import { getPaymentAccounts } from '@/lib/paymentAccounts';
import { getOrCreateCheckoutSession, normalizePhone, phoneMatchesOperator, redeemAccessCode, resendAccessCode } from '@/lib/checkoutSessions';
import { useLicense } from '@/hooks/useLicense';
import type { BillingPlan } from '@/types/restaurant';

interface AutoPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  plan: BillingPlan;
  amount: number;
  contactEmail: string;
  /** Pré-preenchido a partir do perfil, se existir — sempre editável/confirmado pelo cliente antes de criar a sessão (Secção 4.3: usado como 3º critério de correspondência automática). */
  contactPhone?: string;
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
type Operator = 'emola' | 'mpesa';

export default function AutoPaymentDialog({ open, onOpenChange, tenantId, plan, amount, contactEmail, contactPhone }: AutoPaymentDialogProps) {
  const { refresh } = useLicense();
  const [operator, setOperator] = useState<Operator>('emola');
  const [phone, setPhone] = useState(contactPhone ?? '');
  const [phoneConfirmed, setPhoneConfirmed] = useState(false);
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
    if (!open) {
      setSessionId(null); setCode(''); setPhoneConfirmed(false); setPhone(contactPhone ?? ''); setOperator('emola');
      requestedKeyRef.current = null;
      return;
    }
    if (!phoneConfirmed) return;
    const key = `${tenantId}:${plan}:${amount}`;
    if (requestedKeyRef.current === key) return;
    requestedKeyRef.current = key;
    setCreating(true);
    getOrCreateCheckoutSession(tenantId, plan, amount, contactEmail, phone)
      .then(session => setSessionId(session.id))
      .catch(err => {
        requestedKeyRef.current = null;
        toast.error('Não foi possível iniciar o pagamento. Tente novamente.');
        console.warn('getOrCreateCheckoutSession failed', err);
        onOpenChange(false);
      })
      .finally(() => setCreating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phoneConfirmed, tenantId, plan, amount, contactEmail]);

  const phoneValid = normalizePhone(phone).length === 9;
  const phoneMatchesChosenOperator = phone.trim() === '' || phoneMatchesOperator(phone, operator);

  const accounts = getPaymentAccounts();
  const operatorNumber = operator === 'emola' ? accounts.emolaNumber : accounts.mpesaNumber;
  const operatorLabel = operator === 'emola' ? 'e-Mola' : 'M-Pesa';

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

        {!phoneConfirmed ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Vai pagar por</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={operator === 'emola' ? 'default' : 'outline'} onClick={() => setOperator('emola')}>
                  e-Mola
                </Button>
                <Button type="button" variant={operator === 'mpesa' ? 'default' : 'outline'} onClick={() => setOperator('mpesa')}>
                  M-Pesa
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              De que número vai pagar? Usamos isto para confirmar automaticamente que foi você quem fez o pagamento.
            </p>
            <div className="space-y-2">
              <Label htmlFor="payer-phone">O seu número {operatorLabel}</Label>
              <Input
                id="payer-phone"
                placeholder="Ex: 86 645 3202"
                inputMode="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="font-mono"
              />
              {phoneValid && !phoneMatchesChosenOperator && (
                <p className="text-xs text-destructive">
                  Este número não parece ser {operatorLabel} — confirma o número, ou muda a operadora acima.
                </p>
              )}
            </div>
            <Button className="w-full" disabled={!phoneValid || !phoneMatchesChosenOperator} onClick={() => setPhoneConfirmed(true)}>
              Continuar
            </Button>
          </div>
        ) : creating || !sessionId ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> A preparar…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" /> A aguardar pagamento…
            </div>
            <div className="rounded-lg bg-secondary/40 p-3 text-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs">Valor a pagar</span>
                <span className="font-heading font-bold">{formatMT(amount)}</span>
              </div>
              {operatorNumber && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground text-xs flex items-center gap-1"><Smartphone className="w-3 h-3" />{operatorLabel}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{operatorNumber}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(operatorNumber, 'Número')}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pague o valor exacto acima — não precisa de colocar nenhuma referência/conteúdo.
              Assim que confirmarmos o pagamento,
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
