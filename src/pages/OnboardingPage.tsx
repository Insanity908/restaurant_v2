import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Users, Plus, Trash2, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLicense } from '@/hooks/useLicense';
import { tenantStore } from '@/lib/tenants';
import { staffStore, seedData } from '@/lib/store';
import type { UserRole } from '@/types/restaurant';
import { toast } from 'sonner';

type Invite = { name: string; role: Exclude<UserRole, 'admin' | 'manager' | 'superadmin'>; pin: string };

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useLicense();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: tenants owned by this manager's email (allow adding extra restaurants)
  const myTenants = tenantStore.getAll().filter(t => t.ownerEmail === user?.email);
  const [extraName, setExtraName] = useState('');

  // Step 2: invite team members
  const [invites, setInvites] = useState<Invite[]>([
    { name: '', role: 'cashier', pin: '' },
  ]);

  const addExtraTenant = () => {
    if (!user?.email || !extraName.trim()) return;
    const t = tenantStore.create({ name: extraName.trim(), ownerEmail: user.email });
    tenantStore.setCurrent(t.id);
    seedData();
    setExtraName('');
    toast.success(`Restaurante "${t.name}" criado`);
  };

  const switchTenant = (id: string) => {
    tenantStore.setCurrent(id);
    seedData();
    toast.success('Restaurante selecionado');
    // force refresh of license
    setTimeout(() => window.location.reload(), 200);
  };

  const updateInvite = (i: number, patch: Partial<Invite>) =>
    setInvites(prev => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v));

  const addInviteRow = () =>
    setInvites(prev => [...prev, { name: '', role: 'waiter', pin: '' }]);

  const removeInvite = (i: number) =>
    setInvites(prev => prev.filter((_, idx) => idx !== i));

  const finishOnboarding = () => {
    const valid = invites.filter(v => v.name.trim() && /^\d{4}$/.test(v.pin));
    const pins = new Set<string>();
    for (const v of valid) {
      if (pins.has(v.pin) || staffStore.findByPin(v.pin)) {
        toast.error(`PIN ${v.pin} duplicado ou já em uso`);
        return;
      }
      pins.add(v.pin);
    }
    valid.forEach(v => staffStore.add({ name: v.name.trim(), role: v.role, pin: v.pin }));
    if (valid.length > 0) toast.success(`${valid.length} membro(s) adicionado(s)`);
    navigate('/pricing', { replace: true });
  };

  return (
    <PageShell
      title="Configurar a sua unidade"
      subtitle="Vamos preparar o seu restaurante em 2 passos"
    >
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <StepPill n={1} label="Restaurante" active={step === 1} done={step > 1} />
        <div className="flex-1 h-px bg-border" />
        <StepPill n={2} label="Equipa" active={step === 2} done={false} />
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
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" />Adicionar outra unidade</h3>
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
              Cada membro entra com PIN de 4 dígitos. Pode adicionar mais tarde em Equipa.
            </p>
            <div className="space-y-2 mt-4">
              {invites.map((v, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
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
                  <div className="col-span-2">
                    <Label className="text-[11px]">PIN</Label>
                    <Input
                      value={v.pin}
                      onChange={e => updateInvite(i, { pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="0000"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="col-span-1">
                    <Button size="icon" variant="ghost" onClick={() => removeInvite(i)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
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
              <Button variant="outline" onClick={() => navigate('/pricing', { replace: true })}>Saltar</Button>
              <Button onClick={finishOnboarding}>
                <Check className="w-4 h-4" />Concluir
              </Button>
            </div>
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
