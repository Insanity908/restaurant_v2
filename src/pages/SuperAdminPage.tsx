import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Lock, Unlock, Trash2, Clock, Search, Building2, TrendingUp, Users, BarChart3, Copy, Landmark, Save, CheckCircle2, Inbox, MessageSquare, Mail, MailOpen, Images, ImagePlus, Wallet, HardDrive, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { tenantStore, fetchTenants, fetchTenantTeams, type TenantTeam } from '@/lib/tenants';
import { PLANS, formatMT, fetchPlans, savePlans, BASIC_PLANS, PRO_PLANS, type PlanConfig } from '@/lib/billing';
import { Textarea } from '@/components/ui/textarea';
import { getPaymentAccounts, savePaymentAccounts, fetchPaymentAccounts, type PaymentAccounts } from '@/lib/paymentAccounts';
import { fetchPendingSubmissions, markSubmissionStatus, type PaymentSubmission } from '@/lib/paymentSubmissions';
import { fetchFeedback, markFeedbackStatus, type FeedbackSubmission } from '@/lib/feedback';
import { fetchPresetImages, uploadPresetImage, deletePresetImage, type PresetImage } from '@/lib/presetImages';
import { PRESET_IMAGES_BUCKET, fetchStorageUsage, type StorageUsage } from '@/lib/storage';
import StorageImage from '@/components/StorageImage';
import type { Tenant, BillingPlan } from '@/types/restaurant';
import { toast } from 'sonner';

export default function SuperAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [query, setQuery] = useState('');
  const [blockTarget, setBlockTarget] = useState<Tenant | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [extendTarget, setExtendTarget] = useState<Tenant | null>(null);
  const [extendDays, setExtendDays] = useState(30);
  const [reduceTarget, setReduceTarget] = useState<Tenant | null>(null);
  const [reduceDays, setReduceDays] = useState(30);
  const [activateTarget, setActivateTarget] = useState<Tenant | null>(null);
  const [activatePlan, setActivatePlan] = useState<BillingPlan>('monthly');
  const [activateRef, setActivateRef] = useState('');
  const [confirmAction, setConfirmAction] = useState<{
    title: string; description: string; confirmLabel: string; onConfirm: () => void;
  } | null>(null);

  const [teams, setTeams] = useState<Record<string, TenantTeam>>({});
  const [loading, setLoading] = useState(true);
  const [pendingSubs, setPendingSubs] = useState<PaymentSubmission[]>([]);
  const [activatingSubmissionId, setActivatingSubmissionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [list, tm] = await Promise.all([
      fetchTenants().catch(() => tenantStore.getAll()),
      fetchTenantTeams().catch(() => ({} as Record<string, TenantTeam>)),
    ]);
    setTenants(list);
    setTeams(tm);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const refreshPending = useCallback(async () => {
    setPendingSubs(await fetchPendingSubmissions().catch(() => []));
  }, []);
  useEffect(() => { void refreshPending(); }, [refreshPending]);

  const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
  const refreshFeedback = useCallback(async () => {
    setFeedback(await fetchFeedback().catch(() => []));
  }, []);
  useEffect(() => { void refreshFeedback(); }, [refreshFeedback]);
  const unreadFeedbackCount = feedback.filter(f => f.status === 'unread').length;

  const toggleFeedbackStatus = async (f: FeedbackSubmission) => {
    const next = f.status === 'unread' ? 'read' : 'unread';
    const ok = await markFeedbackStatus(f.id, next);
    if (!ok) { toast.error('Não foi possível actualizar'); return; }
    void refreshFeedback();
  };

  const [presetImages, setPresetImages] = useState<PresetImage[]>([]);
  const refreshPresetImages = useCallback(async () => {
    setPresetImages(await fetchPresetImages().catch(() => []));
  }, []);
  useEffect(() => { void refreshPresetImages(); }, [refreshPresetImages]);
  const presetCategories = useMemo(
    () => Array.from(new Set(presetImages.map(i => i.category))).sort(),
    [presetImages],
  );

  const [planForm, setPlanForm] = useState<Record<BillingPlan, PlanConfig>>(PLANS);
  const [savingPlans, setSavingPlans] = useState(false);
  useEffect(() => { void fetchPlans().then(() => setPlanForm({ ...PLANS })).catch(() => { /* keep defaults */ }); }, []);

  const updatePlan = (id: BillingPlan, patch: Partial<PlanConfig>) => {
    setPlanForm(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSavePlans = async () => {
    setSavingPlans(true);
    const ok = await savePlans(planForm);
    setSavingPlans(false);
    if (!ok) { toast.error('Não foi possível guardar os planos'); return; }
    toast.success('Planos atualizados');
  };

  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadingPreset, setUploadingPreset] = useState(false);
  const presetFileRef = useRef<HTMLInputElement>(null);

  const handlePresetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!uploadCategory.trim()) { toast.error('Indique uma categoria'); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagem muito grande (máx 3MB)'); return; }
    const label = uploadLabel.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    setUploadingPreset(true);
    const ok = await uploadPresetImage(file, uploadCategory.trim(), label);
    setUploadingPreset(false);
    if (!ok) { toast.error('Falha ao carregar imagem'); return; }
    setUploadLabel('');
    void refreshPresetImages();
  };

  const handlePresetDelete = async (img: PresetImage) => {
    const ok = await deletePresetImage(img.id, img.storagePath);
    if (!ok) { toast.error('Não foi possível remover'); return; }
    void refreshPresetImages();
  };

  const filtered = useMemo(
    () => tenants.filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.ownerEmail.includes(query.toLowerCase())),
    [tenants, query],
  );

  const stats = useMemo(() => {
    const active = tenants.filter(t => t.subscription.status === 'active').length;
    const trial = tenants.filter(t => t.subscription.status === 'trial').length;
    const expired = tenants.filter(t => t.subscription.status === 'expired' || t.subscription.status === 'blocked').length;
    const mrr = tenants.reduce((s, t) => {
      if (t.subscription.status !== 'active' || !t.subscription.plan) return s;
      const p = PLANS[t.subscription.plan];
      return s + p.price / p.months;
    }, 0);
    const expiringSoon = tenants.filter(t => {
      const d = tenantStore.daysUntilExpiry(t);
      return d > 0 && d <= 14 && t.subscription.status === 'active';
    }).length;
    return { active, trial, expired, mrr, expiringSoon, total: tenants.length };
  }, [tenants]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    const res = await fn();
    if (!res.ok) { toast.error(res.error || 'Operação falhou'); return false; }
    await refresh();
    toast.success(okMsg);
    return true;
  };

  // Recebem o alvo por parâmetro (fechado no clique do diálogo de motivo/
  // dias/plano), em vez de o ler de blockTarget/extendTarget/etc — esses
  // states já foram limpos nesse momento (ver comentário nos onClick dos
  // diálogos abaixo), por isso lê-los aqui devolvia sempre null e a acção
  // não fazia nada, sem erro nenhum visível.
  const doBlock = async (target: Tenant | null) => {
    if (!target) return;
    const ok = await run(() => tenantStore.block(target.id, blockReason || 'Bloqueado pelo administrador'), 'Restaurante bloqueado');
    if (ok) setBlockReason('');
  };

  const doUnblock = (t: Tenant) => run(() => tenantStore.unblock(t.id), 'Restaurante desbloqueado');

  const doExtend = async (target: Tenant | null, days: number) => {
    if (!target) return;
    await run(() => tenantStore.extend(target.id, days), `Subscrição estendida +${days} dias`);
  };

  const doReduce = async (target: Tenant | null, days: number) => {
    if (!target) return;
    await run(() => tenantStore.reduce(target.id, days), `Subscrição reduzida -${days} dias`);
  };

  const doActivate = async (target: Tenant | null, plan: BillingPlan, ref: string) => {
    if (!target) return;
    const ok = await run(
      () => tenantStore.activatePlan(target.id, plan, ref.trim() || undefined),
      'Plano ativado',
    );
    if (ok) {
      setActivateRef('');
      // Se esta ativação partiu de um comprovativo pendente (ver tab
      // "Pagamentos pendentes"), marcá-lo como resolvido — não desbloqueia
      // nada por si, activatePlan já o fez acima; isto só tira o item da fila.
      if (activatingSubmissionId) {
        await markSubmissionStatus(activatingSubmissionId, 'resolved');
        setActivatingSubmissionId(null);
        void refreshPending();
      }
    }
  };

  const doDismissSubmission = async (id: string) => {
    const ok = await markSubmissionStatus(id, 'dismissed');
    if (!ok) { toast.error('Não foi possível dispensar'); return; }
    toast.success('Comprovativo dispensado');
    void refreshPending();
  };

  const doDelete = (t: Tenant) => run(() => tenantStore.remove(t.id), 'Restaurante eliminado');

  const statusBadge = (t: Tenant) => {
    const s = t.subscription.status;
    const tones: Record<string, string> = {
      active: 'bg-success/15 text-success border-success/30',
      trial: 'bg-primary/15 text-primary border-primary/30',
      expired: 'bg-destructive/15 text-destructive border-destructive/30',
      blocked: 'bg-destructive/25 text-destructive border-destructive/40',
    };
    return <Badge variant="outline" className={tones[s]}>{s}</Badge>;
  };

  const allPayments = useMemo(() => {
    const rows: { tenant: string; plan: string; price: number; paidAt: string }[] = [];
    tenants.forEach(t => {
      (t.subscription.history || []).forEach(h => {
        rows.push({ tenant: t.name, plan: PLANS[h.plan].label, price: PLANS[h.plan].price, paidAt: h.paidAt });
      });
    });
    return rows.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }, [tenants]);

  return (
    <PageShell title="Painel Super-Admin" subtitle="Gestão de plataforma e clientes">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="w-3.5 h-3.5" />Restaurantes</div>
          <p className="font-heading text-2xl font-bold mt-1">{stats.total}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="font-heading text-2xl font-bold text-success mt-1">{stats.active}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Em teste</p>
          <p className="font-heading text-2xl font-bold text-primary mt-1">{stats.trial}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Expirados/bloqueados</p>
          <p className="font-heading text-2xl font-bold text-destructive mt-1">{stats.expired}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="w-3.5 h-3.5" />MRR estimado</div>
          <p className="font-heading text-2xl font-bold mt-1">{formatMT(Math.round(stats.mrr))}</p>
        </div>
      </div>

      {stats.expiringSoon > 0 && (
        <div className="glass rounded-xl p-3 mb-4 border border-primary/30 text-sm">
          <Clock className="w-4 h-4 inline mr-2 text-primary" />
          <strong>{stats.expiringSoon}</strong> restaurante(s) com subscrição a expirar nos próximos 14 dias.
        </div>
      )}

      <Tabs defaultValue="tenants">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="tenants">Restaurantes</TabsTrigger>
          <TabsTrigger value="pending-payments">
            <Inbox className="w-3.5 h-3.5 mr-1" />Pagamentos pendentes
            {pendingSubs.length > 0 && <Badge variant="outline" className="ml-1.5 border-primary/30 text-primary">{pendingSubs.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="accounts"><Landmark className="w-3.5 h-3.5 mr-1" />Contas de recebimento</TabsTrigger>
          <TabsTrigger value="plans"><Wallet className="w-3.5 h-3.5 mr-1" />Planos</TabsTrigger>
          <TabsTrigger value="feedback">
            <MessageSquare className="w-3.5 h-3.5 mr-1" />Feedback
            {unreadFeedbackCount > 0 && <Badge variant="outline" className="ml-1.5 border-primary/30 text-primary">{unreadFeedbackCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="gallery"><Images className="w-3.5 h-3.5 mr-1" />Galeria</TabsTrigger>
          <TabsTrigger value="system"><BarChart3 className="w-3.5 h-3.5 mr-1" />Relatórios de sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <div className="flex items-center gap-2 my-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Procurar por nome ou email" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>

          {loading && tenants.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">A carregar restaurantes...</div>
          ) : filtered.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto opacity-30 mb-3" />
              Nenhum restaurante registado.
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(t => {
                const days = tenantStore.daysUntilExpiry(t);
                const admin = teams[t.id]?.admins[0];
                return (
                  <div key={t.id} className="glass rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row md:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-heading font-semibold">{t.name}</h2>
                          {statusBadge(t)}
                          {t.subscription.plan && <Badge variant="outline">{PLANS[t.subscription.plan].label}</Badge>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <code className="text-[10px] text-muted-foreground bg-secondary/40 px-1.5 py-0.5 rounded">ID: {t.id}</code>
                          <button
                            onClick={() => { navigator.clipboard.writeText(t.id); toast.success('ID copiado'); }}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copiar ID"
                          ><Copy className="w-3 h-3" /></button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Expira: {t.subscription.expiresAt ? new Date(t.subscription.expiresAt).toLocaleDateString('pt-MZ') : '—'} ({Math.max(0, days)}d)
                        </p>
                        {admin && (
                          <div className="mt-2 text-xs text-muted-foreground rounded-lg bg-secondary/30 p-2">
                            <p className="text-[10px] uppercase text-muted-foreground/70">Administrador</p>
                            <p className="text-foreground">{admin.name}</p>
                            <p>{admin.email}</p>
                            {admin.phone && <p>Tel: {admin.phone}</p>}
                          </div>
                        )}
                        <code className="text-[10px] text-muted-foreground block mt-1">Licença: {t.licenseKey}</code>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => { setExtendTarget(t); setExtendDays(30); }}>
                          <Clock className="w-3.5 h-3.5" />+ Dias
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setReduceTarget(t); setReduceDays(30); }}>
                          <Clock className="w-3.5 h-3.5" />- Dias
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setActivateTarget(t); setActivatePlan(t.subscription.plan || 'monthly'); setActivateRef(''); setActivatingSubmissionId(null); }}>
                          <CheckCircle2 className="w-3.5 h-3.5" />Ativar plano
                        </Button>
                        {t.subscription.blockedByAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmAction({
                              title: `Desbloquear ${t.name}?`,
                              description: 'O restaurante e toda a equipa voltam a ter acesso normal imediatamente.',
                              confirmLabel: 'Desbloquear',
                              onConfirm: () => doUnblock(t),
                            })}
                          >
                            <Unlock className="w-3.5 h-3.5" />Desbloquear
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setBlockTarget(t); setBlockReason(''); }}>
                            <Lock className="w-3.5 h-3.5" />Bloquear
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" aria-label="Eliminar restaurante"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar {t.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação remove o restaurante e todas as contas associadas. Não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => doDelete(t)}>Eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending-payments">
          <div className="glass rounded-xl p-5 mt-4">
            {pendingSubs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem comprovativos pendentes.</p>
            ) : (
              <div className="space-y-2">
                {pendingSubs.map(sub => (
                  <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm py-3 border-b border-border/40 last:border-0">
                    <div>
                      <p className="font-medium">{sub.tenantName || sub.tenantId}</p>
                      <p className="text-xs text-muted-foreground">
                        Referência: <span className="font-mono">{sub.reference}</span> • {new Date(sub.createdAt).toLocaleString('pt-MZ')}
                      </p>
                      {sub.note && <p className="text-xs text-muted-foreground">Nota: {sub.note}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => {
                          const t = tenants.find(x => x.id === sub.tenantId);
                          if (!t) { toast.error('Restaurante não encontrado'); return; }
                          setActivateTarget(t);
                          setActivatePlan(t.subscription.plan || 'monthly');
                          setActivateRef(sub.reference);
                          setActivatingSubmissionId(sub.id);
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />Ativar plano
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => doDismissSubmission(sub.id)}>
                        Dispensar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="accounts">
          <PaymentAccountsForm />
        </TabsContent>

        <TabsContent value="plans">
          <PlansForm value={planForm} onChange={updatePlan} onSave={handleSavePlans} saving={savingPlans} />
        </TabsContent>

        <TabsContent value="payments">
          <div className="glass rounded-xl p-5 mt-4">
            {allPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem pagamentos registados.</p>
            ) : (
              <div className="space-y-2">
                {allPayments.map((p, i) => (
                  <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-border/40 last:border-0">
                    <div>
                      <p className="font-medium">{p.tenant}</p>
                      <p className="text-xs text-muted-foreground">{p.plan} • {new Date(p.paidAt).toLocaleString('pt-MZ')}</p>
                    </div>
                    <p className="font-medium">{formatMT(p.price)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="feedback">
          <div className="glass rounded-xl p-5 mt-4">
            {feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem feedback recebido.</p>
            ) : (
              <div className="space-y-2">
                {feedback.map(f => (
                  <div key={f.id} className={`flex items-start justify-between gap-3 text-sm py-3 border-b border-border/40 last:border-0 ${f.status === 'unread' ? '' : 'opacity-70'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{f.name}</p>
                        <Badge variant="outline" className="text-[10px]">{f.role}</Badge>
                        {f.tenantName && <span className="text-xs text-muted-foreground">{f.tenantName}</span>}
                        {f.status === 'unread' && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Novo</Badge>}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{f.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(f.createdAt).toLocaleString('pt-MZ')}</p>
                    </div>
                    <Button size="icon" variant="ghost" aria-label={f.status === 'unread' ? 'Marcar como lido' : 'Marcar como não lido'} onClick={() => toggleFeedbackStatus(f)}>
                      {f.status === 'unread' ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4 text-muted-foreground" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="gallery">
          <div className="glass rounded-xl p-5 mt-4 space-y-4">
            <div>
              <h3 className="font-heading font-semibold">Nova imagem</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fica disponível para todos os restaurantes escolherem no Menu e no Inventário.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Categoria</Label>
                <Input
                  list="preset-categories"
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                  placeholder="Ex: Bebidas"
                />
                <datalist id="preset-categories">
                  {presetCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Rótulo (opcional)</Label>
                <Input value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} placeholder="Ex: Coca-Cola" />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={uploadingPreset}
              onClick={() => presetFileRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4" /> {uploadingPreset ? 'A carregar…' : 'Escolher ficheiro'}
            </Button>
            <input ref={presetFileRef} type="file" accept="image/*" className="hidden" onChange={handlePresetUpload} disabled={uploadingPreset} />
          </div>

          <div className="glass rounded-xl p-5 mt-4">
            {presetImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem imagens na galeria.</p>
            ) : (
              presetCategories.map(cat => (
                <div key={cat} className="mb-5 last:mb-0">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{cat}</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {presetImages.filter(i => i.category === cat).map(img => (
                      <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-border">
                        <StorageImage bucket={PRESET_IMAGES_BUCKET} path={img.storagePath} alt={img.label} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handlePresetDelete(img)}
                          aria-label={`Remover ${img.label}`}
                          className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                        <span className="absolute inset-x-0 bottom-0 bg-background/80 text-[9px] px-1 py-0.5 truncate">{img.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="system">
          <SystemReports tenants={tenants} teams={teams} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!blockTarget && !confirmAction} onOpenChange={o => !o && setBlockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear {blockTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo do bloqueio</Label>
            <Input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Falta de pagamento, violação de termos..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                // Captura o target antes de o limpar: senão, enquanto o pedido
                // ao servidor está pendente, `!!blockTarget && !confirmAction`
                // volta a ficar verdadeiro assim que este diálogo de confirmação
                // fecha, e o diálogo do motivo reabre sozinho por cima (parece
                // que "não sai da tela"/não bloqueou, mesmo quando funcionou) —
                // e doBlock precisa do target, por isso vai por parâmetro, não
                // por state (que já estará null quando o utilizador confirmar).
                const target = blockTarget;
                setBlockTarget(null);
                setConfirmAction({
                  title: `Bloquear ${target?.name}?`,
                  description: `O restaurante e toda a equipa ficam sem acesso imediatamente${blockReason ? ` — motivo: "${blockReason}"` : ''}.`,
                  confirmLabel: 'Bloquear',
                  onConfirm: () => doBlock(target),
                });
              }}
            >
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extendTarget && !confirmAction} onOpenChange={o => !o && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estender subscrição — {extendTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Dias a adicionar</Label>
            <Input
              type="number"
              value={extendDays === 0 ? '' : extendDays}
              onChange={e => setExtendDays(e.target.value === '' ? 0 : Number(e.target.value))}
              min={1}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                const target = extendTarget;
                const days = extendDays;
                setExtendTarget(null);
                setConfirmAction({
                  title: `Estender subscrição — ${target?.name}?`,
                  description: `A subscrição fica válida por mais ${days} dia(s).`,
                  confirmLabel: 'Estender',
                  onConfirm: () => doExtend(target, days),
                });
              }}
            >
              Estender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!reduceTarget && !confirmAction} onOpenChange={o => !o && setReduceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reduzir subscrição — {reduceTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Dias a remover</Label>
            <Input
              type="number"
              value={reduceDays === 0 ? '' : reduceDays}
              onChange={e => setReduceDays(e.target.value === '' ? 0 : Number(e.target.value))}
              min={1}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReduceTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = reduceTarget;
                const days = reduceDays;
                setReduceTarget(null);
                setConfirmAction({
                  title: `Reduzir subscrição — ${target?.name}?`,
                  description: `Remove ${days} dia(s) da subscrição. Se a data de expiração ficar no passado, a conta passa a "expirado".`,
                  confirmLabel: 'Reduzir',
                  onConfirm: () => doReduce(target, days),
                });
              }}
            >
              Reduzir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!activateTarget && !confirmAction} onOpenChange={o => !o && setActivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar plano — {activateTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Plano pago</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PLANS) as BillingPlan[]).map(k => (
                  <Button
                    key={k}
                    type="button"
                    size="sm"
                    variant={activatePlan === k ? 'default' : 'outline'}
                    onClick={() => setActivatePlan(k)}
                  >
                    {PLANS[k].label} — {formatMT(PLANS[k].price)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Referência do pagamento (opcional)</Label>
              <Input value={activateRef} onChange={e => setActivateRef(e.target.value)} placeholder="Nº do comprovativo / transferência" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActivateTarget(null); setActivatingSubmissionId(null); }}>Cancelar</Button>
            <Button
              onClick={() => {
                const target = activateTarget;
                const plan = activatePlan;
                const ref = activateRef;
                setActivateTarget(null);
                setConfirmAction({
                  title: `Ativar plano — ${target?.name}?`,
                  description: `Activa o plano ${PLANS[plan].label} (${formatMT(PLANS[plan].price)}).`,
                  confirmLabel: 'Confirmar ativação',
                  onConfirm: () => doActivate(target, plan, ref),
                });
              }}
            >
              Confirmar ativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação genérica — toda a operação que afecta outra conta passa por aqui. */}
      <AlertDialog open={!!confirmAction} onOpenChange={o => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmAction?.onConfirm();
                setConfirmAction(null);
              }}
            >
              {confirmAction?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

const BUCKET_LABEL: Record<string, string> = {
  'menu-images': 'Imagens do cardápio',
  'receipt-logos': 'Logótipos',
  'preset-images': 'Galeria de imagens',
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function StorageUsageSection() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchStorageUsage().then(setUsage).catch(() => setError(true));
  }, []);

  const totalStorage = usage ? Object.values(usage.buckets).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="glass rounded-xl p-5">
      <h2 className="font-heading font-semibold mb-3 flex items-center gap-2">
        <HardDrive className="w-4 h-4" /> Armazenamento (Supabase)
      </h2>
      {error ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar os dados de armazenamento.</p>
      ) : !usage ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(usage.buckets).map(([bucket, bytes]) => (
            <div key={bucket} className="rounded-lg bg-secondary/40 p-3">
              <p className="text-[11px] text-muted-foreground">{BUCKET_LABEL[bucket] || bucket}</p>
              <p className="font-heading font-semibold">{formatBytes(bytes)}</p>
            </div>
          ))}
          <div className="rounded-lg bg-secondary/40 p-3">
            <p className="text-[11px] text-muted-foreground">Total de ficheiros</p>
            <p className="font-heading font-semibold">{formatBytes(totalStorage)}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-3">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Database className="w-3 h-3" /> Base de dados</p>
            <p className="font-heading font-semibold">{formatBytes(usage.databaseBytes)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemReports({ tenants, teams }: { tenants: Tenant[]; teams: Record<string, TenantTeam> }) {
  const growthData = useMemo(() => {
    const buckets: { month: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('pt-MZ', { month: 'short' });
      const count = tenants.filter(t => {
        const c = new Date(t.createdAt);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
      }).length;
      buckets.push({ month: label, count });
    }
    return buckets;
  }, [tenants]);

  const planDist = useMemo(() => {
    const map: Record<string, number> = { Trimestral: 0, Semestral: 0, Anual: 0, Trial: 0 };
    tenants.forEach(t => {
      if (t.subscription.status === 'trial') map.Trial++;
      else if (t.subscription.plan) map[PLANS[t.subscription.plan].label]++;
    });
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [tenants]);

  const revenueData = useMemo(() => {
    const buckets: { month: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('pt-MZ', { month: 'short' });
      let revenue = 0;
      tenants.forEach(t => {
        (t.subscription.history || []).forEach(h => {
          const p = new Date(h.paidAt);
          if (p.getFullYear() === d.getFullYear() && p.getMonth() === d.getMonth()) {
            revenue += PLANS[h.plan].price;
          }
        });
      });
      buckets.push({ month: label, revenue });
    }
    return buckets;
  }, [tenants]);

  const topByRevenue = useMemo(() => {
    return tenants
      .map(t => ({
        tenant: t,
        revenue: (t.subscription.history || []).reduce((s, h) => s + PLANS[h.plan].price, 0),
        renewals: (t.subscription.history || []).length,
      }))
      .filter(r => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [tenants]);

  const teamRows = useMemo(() => {
    return tenants.map(t => ({
      tenant: t,
      managers: (teams[t.id]?.admins ?? []).map(a => a.name || a.email),
      accountsCount: teams[t.id]?.membersCount ?? 0,
    })).sort((a, b) => b.accountsCount - a.accountsCount);
  }, [tenants, teams]);

  return (
    <div className="space-y-4 mt-4">
      <StorageUsageSection />

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h2 className="font-heading font-semibold mb-3">Crescimento de restaurantes (6 meses)</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <h2 className="font-heading font-semibold mb-3">Distribuição por plano</h2>
          <div className="h-56">
            {planDist.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center pt-12">Sem dados.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={planDist} dataKey="value" nameKey="name" outerRadius={80} label>
                    {planDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-5">
        <h2 className="font-heading font-semibold mb-3">Receita por mês (6 meses)</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: number) => formatMT(v)}
              />
              <Bar dataKey="revenue" fill="hsl(var(--success))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h2 className="font-heading font-semibold mb-3">Top restaurantes (receita acumulada)</h2>
          {topByRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem pagamentos ainda.</p>
          ) : (
            <div className="space-y-2">
              {topByRevenue.map(r => (
                <div key={r.tenant.id} className="flex justify-between items-center text-sm py-2 border-b border-border/40 last:border-0">
                  <div>
                    <p className="font-medium">{r.tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{r.renewals} renovação(ões)</p>
                  </div>
                  <p className="font-medium">{formatMT(r.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <h2 className="font-heading font-semibold mb-3">Gestão de equipas</h2>
          {teamRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem restaurantes.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {teamRows.map(r => (
                <div key={r.tenant.id} className="text-sm py-2 border-b border-border/40 last:border-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.tenant.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.managers.length > 0 ? r.managers.join(', ') : 'Sem gerente'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.accountsCount} conta(s)</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentAccountsForm() {
  const [data, setData] = useState<PaymentAccounts>(() => getPaymentAccounts());
  useEffect(() => {
    fetchPaymentAccounts().then(setData).catch(() => { /* keep cache */ });
  }, []);
  const set = <K extends keyof PaymentAccounts>(k: K, v: PaymentAccounts[K]) =>
    setData(prev => ({ ...prev, [k]: v }));
  return (
    <div className="glass rounded-xl p-5 mt-4 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-heading font-semibold">Dados de recebimento</h2>
        <p className="text-xs text-muted-foreground mt-1">Mostrados aos administradores na página de faturação para pagamento manual.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Banco</Label>
          <Input value={data.bankName || ''} onChange={e => set('bankName', e.target.value)} placeholder="BCI, BIM..." />
        </div>
        <div className="space-y-1.5">
          <Label>Titular</Label>
          <Input value={data.bankHolder || ''} onChange={e => set('bankHolder', e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Número da conta bancária</Label>
          <Input value={data.bankAccount || ''} onChange={e => set('bankAccount', e.target.value)} placeholder="0000 0000 0000" />
        </div>
        <div className="space-y-1.5">
          <Label>Provedor conta móvel</Label>
          <Input value={data.mobileMoneyProvider || ''} onChange={e => set('mobileMoneyProvider', e.target.value)} placeholder="M-Pesa, e-Mola..." />
        </div>
        <div className="space-y-1.5">
          <Label>Número da conta móvel</Label>
          <Input value={data.mobileMoney || ''} onChange={e => set('mobileMoney', e.target.value)} placeholder="84 000 0000" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notas / instruções</Label>
          <Input value={data.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Ex: enviar comprovativo para..." />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>WhatsApp do superadmin (activação de planos)</Label>
          <Input
            value={data.superadminWhatsapp || ''}
            onChange={e => set('superadminWhatsapp', e.target.value)}
            placeholder="258 84 000 0000"
          />
          <p className="text-[11px] text-muted-foreground">
            Usado pelos botões de subscrição em /pricing e /billing para abrir uma conversa a pedir activação do plano.
          </p>
        </div>
      </div>
      <Button onClick={() => { savePaymentAccounts(data); toast.success('Dados de recebimento guardados'); }}>
        <Save className="w-4 h-4" /> Guardar
      </Button>
    </div>
  );
}

function PlansForm({
  value, onChange, onSave, saving,
}: {
  value: Record<BillingPlan, PlanConfig>;
  onChange: (id: BillingPlan, patch: Partial<PlanConfig>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const tiers: { label: string; plans: BillingPlan[] }[] = [
    { label: 'Básico', plans: BASIC_PLANS },
    { label: 'Profissional', plans: PRO_PLANS },
  ];
  return (
    <div className="glass rounded-xl p-5 mt-4 space-y-4">
      <div>
        <h2 className="font-heading font-semibold">Planos de subscrição</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Valores e serviços incluídos em cada plano — usados na página de preços e na ativação manual de restaurantes.
        </p>
      </div>
      {tiers.map(({ label, plans }) => (
      <div key={label} className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {plans.map(id => {
          const p = value[id];
          return (
            <div key={id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={p.label} onChange={e => onChange(id, { label: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Meses</Label>
                  <Input type="number" min={1} value={p.months} onChange={e => onChange(id, { months: Math.max(1, parseInt(e.target.value) || 1) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preço (MT)</Label>
                  <Input type="number" min={0} value={p.price} onChange={e => onChange(id, { price: Math.max(0, parseFloat(e.target.value) || 0) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Selo (opcional)</Label>
                  <Input value={p.savings || ''} onChange={e => onChange(id, { savings: e.target.value })} placeholder="Poupa 17%" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Serviços incluídos (um por linha)</Label>
                <Textarea
                  value={p.features.join('\n')}
                  onChange={e => onChange(id, { features: e.target.value.split('\n') })}
                  onBlur={e => onChange(id, { features: e.target.value.split('\n').map(f => f.trim()).filter(Boolean) })}
                  rows={5}
                  className="text-sm"
                />
              </div>
            </div>
          );
        })}
        </div>
      </div>
      ))}
      <Button onClick={onSave} disabled={saving}>
        <Save className="w-4 h-4" /> {saving ? 'A guardar…' : 'Guardar planos'}
      </Button>
    </div>
  );
}


