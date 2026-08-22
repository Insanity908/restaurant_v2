import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Users, Plus, Trash2, ArrowRight, Check, UtensilsCrossed, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLicense } from '@/hooks/useLicense';
import { tenantStore } from '@/lib/tenants';
import { staffStore } from '@/lib/store';
import { validateIntlPhone, maskIntlPhone } from '@/lib/validators';
import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/types/restaurant';
import { toast } from 'sonner';
import { errorBodyMessage, extractFunctionErrorMessage } from '@/lib/functionError';

type Invite = {
  name: string;
  role: Exclude<UserRole, 'admin' | 'manager' | 'superadmin'>;
  phone: string;
  password: string;
};

const emptyInvite = (): Invite => ({ name: '', role: 'cashier', phone: '', password: '' });
const JUST_ONBOARDED_KEY = 'onboarding_just_created';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useLicense();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Tenants owned by this account (multi-restaurant)
  const myTenants = (() => {
    const ids = user?.tenantIds || (user?.tenantId ? [user.tenantId] : []);
    return tenantStore.getAll().filter(t => ids.includes(t.id));
  })();
  const [extraName, setExtraName] = useState('');

  // Step 2: invite team members
  const [invites, setInvites] = useState<Invite[]>([emptyInvite()]);
  const [inviting, setInviting] = useState(false);

  // Multi-unidade fica para o futuro: quem já tem um restaurante não tem
  // motivo para voltar aqui (nem para criar outro) — só passa por esta
  // página quem ainda não tem nenhum, seja no primeiro registo ou a
  // recuperar de um bootstrap que falhou a meio.
  //
  // Criar o primeiro restaurante (abaixo, addExtraTenant) recarrega a
  // página para o resto da app apanhar o tenant novo — nesse recarregamento
  // já existe 1 tenant, e sem esta flag o guard mandava a própria pessoa
  // que ACABOU de criar o restaurante de volta para o dashboard antes de
  // conseguir chegar ao passo 2 (convidar equipa). A flag é consumida uma
  // única vez: só sobrevive a ESSE recarregamento, não a visitas seguintes.
  const [blocked] = useState(() => {
    if (myTenants.length === 0) return false;
    if (sessionStorage.getItem(JUST_ONBOARDED_KEY)) {
      sessionStorage.removeItem(JUST_ONBOARDED_KEY);
      return false;
    }
    return true;
  });
  if (blocked) {
    return <Navigate to="/" replace />;
  }

  const addExtraTenant = async () => {
    if (!user?.email || !user?.authUserId || !extraName.trim()) return;
    const { tenant: t, error } = await tenantStore.create({ name: extraName.trim(), ownerEmail: user.email, ownerName: user.name });
    if (!t) { toast.error(error ?? 'Não foi possível criar o restaurante'); return; }
    tenantStore.setCurrent(t.id);
    sessionStorage.setItem(JUST_ONBOARDED_KEY, '1');
    setExtraName('');
    toast.success(`Restaurante "${t.name}" criado`);
    setTimeout(() => window.location.reload(), 400);
  };


  const switchTenant = (id: string) => {
    tenantStore.setCurrent(id);
    toast.success('Restaurante selecionado');
    // force refresh of license
    setTimeout(() => window.location.reload(), 200);
  };

  const updateInvite = (i: number, patch: Partial<Invite>) =>
    setInvites(prev => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v));

  const addInviteRow = () =>
    setInvites(prev => [...prev, emptyInvite()]);

  const removeInvite = (i: number) =>
    setInvites(prev => prev.filter((_, idx) => idx !== i));

  const inviteErrors = (v: Invite): string | null => {
    if (!v.name.trim()) return null; // linha vazia — ignorada, não é erro
    const phone = v.phone.trim();
    if (!phone) return 'Indique um telefone';
    const phoneErr = validateIntlPhone(phone);
    if (phoneErr) return phoneErr;
    if (v.password.length < 8) return 'Password deve ter pelo menos 8 caracteres';
    return null;
  };

  const finishOnboarding = async () => {
    const withContent = invites.filter(v => v.name.trim());
    if (withContent.length === 0) { setStep(3); return; }

    for (const v of withContent) {
      const err = inviteErrors(v);
      if (err) { toast.error(`${v.name.trim()}: ${err}`); return; }
    }
    const phones = withContent.map(v => v.phone.trim());
    if (new Set(phones).size !== phones.length) { toast.error('Há telefones repetidos entre os membros'); return; }

    const tenantId = localStorage.getItem('current_tenant_id');
    if (!tenantId) { toast.error('Sem restaurante ativo'); return; }

    setInviting(true);
    let created = 0;
    const failed: string[] = [];
    for (const v of withContent) {
      const { data, error } = await supabase.functions.invoke('create-staff-account', {
        body: {
          tenantId, name: v.name.trim(), role: v.role,
          phone: v.phone.trim(), password: v.password,
        },
      });
      if (error || !data?.userId) {
        const serverMessage = await extractFunctionErrorMessage(error);
        failed.push(`${v.name.trim()} (${serverMessage || errorBodyMessage(data) || error?.message || 'erro desconhecido'})`);
        continue;
      }
      staffStore.add({ id: data.userId as string, name: v.name.trim(), role: v.role });
      created++;
    }
    setInviting(false);

    if (created > 0) toast.success(`${created} membro(s) adicionado(s)`);
    if (failed.length > 0) toast.error(`Falhou para: ${failed.join(', ')}`);
    setStep(3);
  };

  return (
    <PageShell
      title="Configurar a sua unidade"
      subtitle="Vamos preparar o seu restaurante em 3 passos"
    >
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <StepPill n={1} label="Restaurante" active={step === 1} done={step > 1} />
        <div className="flex-1 h-px bg-border" />
        <StepPill n={2} label="Equipa" active={step === 2} done={step > 2} />
        <div className="flex-1 h-px bg-border" />
        <StepPill n={3} label="Cardápio & Mesas" active={step === 3} done={false} />
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div className="glass rounded-xl p-5">
            <h2 className="font-heading font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4" />Os seus restaurantes
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Pode gerir múltiplas unidades. Os dados (menu, mesas, vendas) ficam isolados por restaurante.
            </p>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              {myTenants.map(t => {
                const active = tenant?.id === t.id;
                return (
                  <div key={t.id} className={`rounded-xl p-4 border ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{t.name}</h3>
                      {active && <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 text-[10px]">ATIVO</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{t.subscription.status} • cria. {new Date(t.createdAt).toLocaleDateString('pt-MZ')}</p>
                    {!active && (
                      <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => switchTenant(t.id)}>
                        Selecionar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {myTenants.length === 0 ? 'Criar o seu restaurante' : 'Adicionar outra unidade'}
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Sabor de Maputo"
                value={extraName}
                onChange={e => setExtraName(e.target.value)}
              />
              <Button onClick={addExtraTenant} disabled={!extraName.trim()}>Criar</Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!tenant}>
              Continuar <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="glass rounded-xl p-5">
            <h2 className="font-heading font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />Convidar membros da equipa
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Cada membro entra com o seu próprio telefone e password. Pode adicionar mais tarde em Equipa.
            </p>
            <div className="space-y-3 mt-4">
              {invites.map((v, i) => (
                <div key={i} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">
                      <Label className="text-[11px]">Nome</Label>
                      <Input value={v.name} onChange={e => updateInvite(i, { name: e.target.value })} placeholder="Maria João" />
                    </div>
                    <div className="col-span-4">
                      <Label className="text-[11px]">Função</Label>
                      <Select value={v.role} onValueChange={(val: Invite['role']) => updateInvite(i, { role: val })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cashier">Caixa</SelectItem>
                          <SelectItem value="waiter">Garçom</SelectItem>
                          <SelectItem value="kitchen">Cozinha</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      <Button size="icon" variant="ghost" onClick={() => removeInvite(i)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Telefone</Label>
                      <Input value={v.phone} onChange={e => updateInvite(i, { phone: maskIntlPhone(e.target.value) })} placeholder="+258 84 123 4567" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Password</Label>
                      <PasswordInput value={v.password} onChange={e => updateInvite(i, { password: e.target.value })} placeholder="mín. 8 caracteres" />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addInviteRow}>
                <Plus className="w-4 h-4" />Adicionar membro
              </Button>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>Saltar</Button>
              <Button onClick={finishOnboarding} disabled={inviting}>
                <Check className="w-4 h-4" />{inviting ? 'A criar...' : 'Concluir'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="glass rounded-xl p-5 text-center">
            <h2 className="font-heading font-semibold text-lg">Quase pronto!</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Falta só preparar o cardápio e as mesas antes do primeiro pedido.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/menu')}
              className="glass rounded-xl p-6 text-left hover:border-primary/50 border border-transparent transition-colors"
            >
              <UtensilsCrossed className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-heading font-semibold">Configurar cardápio</h3>
              <p className="text-xs text-muted-foreground mt-1">Adicione os pratos e categorias do seu menu.</p>
            </button>
            <button
              onClick={() => navigate('/tables')}
              className="glass rounded-xl p-6 text-left hover:border-primary/50 border border-transparent transition-colors"
            >
              <LayoutGrid className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-heading font-semibold">Configurar mesas</h3>
              <p className="text-xs text-muted-foreground mt-1">Crie as mesas do seu espaço para começar a receber pedidos.</p>
            </button>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Voltar</Button>
            <Button onClick={() => navigate('/', { replace: true })}>
              Ir para o Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function StepPill({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${active ? 'border-primary text-primary bg-primary/5' : done ? 'border-success/40 text-success' : 'border-border text-muted-foreground'}`}>
      <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-xs font-bold">
        {done ? <Check className="w-3 h-3" /> : n}
      </span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
