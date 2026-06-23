import { useEffect, useMemo, useState } from 'react';
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
import { Lock, Unlock, Trash2, Clock, Search, Building2, TrendingUp, Users, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { tenantStore } from '@/lib/tenants';
import { accountStore } from '@/lib/accounts';
import { PLANS, formatMT } from '@/lib/billing';
import type { Tenant } from '@/types/restaurant';
import { toast } from 'sonner';

export default function SuperAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [query, setQuery] = useState('');
  const [blockTarget, setBlockTarget] = useState<Tenant | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [extendTarget, setExtendTarget] = useState<Tenant | null>(null);
  const [extendDays, setExtendDays] = useState(30);

  const refresh = () => setTenants(tenantStore.getAll());
  useEffect(() => { refresh(); }, []);

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

  const doBlock = () => {
    if (!blockTarget) return;
    tenantStore.block(blockTarget.id, blockReason || 'Bloqueado pelo administrador');
    setBlockTarget(null);
    setBlockReason('');
    refresh();
    toast.success('Restaurante bloqueado');
  };

  const doUnblock = (t: Tenant) => {
    tenantStore.unblock(t.id);
    refresh();
    toast.success('Restaurante desbloqueado');
  };

  const doExtend = () => {
    if (!extendTarget) return;
    tenantStore.extend(extendTarget.id, extendDays);
    setExtendTarget(null);
    refresh();
    toast.success(`Subscrição estendida +${extendDays} dias`);
  };

  const doDelete = (t: Tenant) => {
    tenantStore.remove(t.id);
    accountStore.removeByTenant(t.id);
    refresh();
    toast.success('Restaurante eliminado');
  };

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
        <TabsList>
          <TabsTrigger value="tenants">Restaurantes</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="system"><BarChart3 className="w-3.5 h-3.5 mr-1" />Relatórios de sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <div className="flex items-center gap-2 my-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Procurar por nome ou email" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto opacity-30 mb-3" />
              Nenhum restaurante registado.
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(t => {
                const days = tenantStore.daysUntilExpiry(t);
                return (
                  <div key={t.id} className="glass rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading font-semibold">{t.name}</h3>
                        {statusBadge(t)}
                        {t.subscription.plan && <Badge variant="outline">{PLANS[t.subscription.plan].label}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.ownerEmail} • Expira: {t.subscription.expiresAt ? new Date(t.subscription.expiresAt).toLocaleDateString('pt-MZ') : '—'} ({Math.max(0, days)}d)
                      </p>
                      <code className="text-[10px] text-muted-foreground">{t.licenseKey}</code>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => { setExtendTarget(t); setExtendDays(30); }}>
                        <Clock className="w-3.5 h-3.5" />+ Dias
                      </Button>
                      {t.subscription.blockedByAdmin ? (
                        <Button size="sm" variant="outline" onClick={() => doUnblock(t)}>
                          <Unlock className="w-3.5 h-3.5" />Desbloquear
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setBlockTarget(t); setBlockReason(''); }}>
                          <Lock className="w-3.5 h-3.5" />Bloquear
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost"><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
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
                );
              })}
            </div>
          )}
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

        <TabsContent value="system">
          <SystemReports tenants={tenants} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!blockTarget} onOpenChange={o => !o && setBlockTarget(null)}>
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
            <Button onClick={doBlock}>Bloquear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extendTarget} onOpenChange={o => !o && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Estender subscrição — {extendTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Dias a adicionar</Label>
            <Input type="number" value={extendDays} onChange={e => setExtendDays(Number(e.target.value))} min={1} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancelar</Button>
            <Button onClick={doExtend}>Estender</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

function SystemReports({ tenants }: { tenants: Tenant[] }) {
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
    const accounts = accountStore.getAll();
    return tenants.map(t => {
      const tenantAccounts = accounts.filter(a => a.tenantId === t.id);
      const managers = tenantAccounts.filter(a => a.role === 'manager').map(a => a.name || a.email);
      return {
        tenant: t,
        managers,
        accountsCount: tenantAccounts.length,
      };
    }).sort((a, b) => b.accountsCount - a.accountsCount);
  }, [tenants]);

  return (
    <div className="space-y-4 mt-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5">
          <h3 className="font-heading font-semibold mb-3">Crescimento de restaurantes (6 meses)</h3>
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
          <h3 className="font-heading font-semibold mb-3">Distribuição por plano</h3>
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
        <h3 className="font-heading font-semibold mb-3">Receita por mês (6 meses)</h3>
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
          <h3 className="font-heading font-semibold mb-3">Top restaurantes (receita acumulada)</h3>
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
          <h3 className="font-heading font-semibold mb-3">Gestão de equipas</h3>
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

