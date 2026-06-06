import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, Plus, Pencil, Trash2, Phone, Cake, Award, TrendingUp, Gift, Users as UsersIcon, AlertCircle, Download, FileText, CloudOff, RefreshCw } from 'lucide-react';
import { customerStore, orderStore } from '@/lib/store';
import { Customer, Order } from '@/types/restaurant';
import { maskMzPhone, maskNuit, validateMpesa, validateNuit } from '@/lib/validators';
import { toast } from 'sonner';
import { buildCustomerReport, exportCustomersCSV, exportCustomersPDF } from '@/lib/customerReport';
import { syncQueue, flushQueue } from '@/lib/syncQueue';

// 1 ponto por cada 10 MT gastos
const POINTS_PER_MT = 1 / 10;

interface CustomerStats {
  totalSpent: number;
  orderCount: number;
  lastVisit?: string;
  earnedPoints: number;
  points: number;
  tier: 'Bronze' | 'Prata' | 'Ouro';
  orders: Order[];
}

function computeStats(customer: Customer, orders: Order[]): CustomerStats {
  const norm = customer.phone.replace(/\D/g, '');
  const matched = orders.filter(
    o => o.paid && (o.customerId === customer.id || (norm && o.customerPhone?.replace(/\D/g, '') === norm))
  );
  const totalSpent = matched.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const lastVisit = matched
    .map(o => o.closedAt || o.updatedAt)
    .sort()
    .reverse()[0];
  const earnedPoints = Math.floor(totalSpent * POINTS_PER_MT);
  const points = Math.max(0, earnedPoints + (customer.pointsAdjustment || 0));
  const tier: CustomerStats['tier'] = points >= 200 ? 'Ouro' : points >= 50 ? 'Prata' : 'Bronze';
  return { totalSpent, orderCount: matched.length, lastVisit, earnedPoints, points, tier, orders: matched };
}

function thisMonthBirthday(b?: string): boolean {
  if (!b) return false;
  // accept 'MM-DD' or ISO
  const md = b.length === 5 ? b : b.slice(5, 10);
  const m = parseInt(md.slice(0, 2), 10);
  return m === new Date().getMonth() + 1;
}

function tierBadge(tier: CustomerStats['tier']) {
  const map = {
    Bronze: 'bg-amber-700/20 text-amber-500 border-amber-700/30',
    Prata: 'bg-zinc-400/20 text-zinc-300 border-zinc-400/30',
    Ouro: 'bg-primary/20 text-primary border-primary/30',
  } as const;
  return map[tier];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(() => customerStore.getAll());
  const [orders] = useState<Order[]>(() => orderStore.getAll());
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);

  // Date range for export
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Sync queue state
  const [pendingSync, setPendingSync] = useState(syncQueue.pendingCount());
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const unsub = syncQueue.subscribe(ops => setPendingSync(ops.filter(o => o.status !== 'error').length));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const refresh = () => setCustomers(customerStore.getAll());

  const enriched = useMemo(
    () => customers.map(c => ({ customer: c, stats: computeStats(c, orders) })),
    [customers, orders]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return enriched;
    const q = query.toLowerCase();
    return enriched.filter(({ customer: c }) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      (c.email?.toLowerCase().includes(q) ?? false)
    );
  }, [enriched, query]);

  const loyaltyList = useMemo(
    () => [...enriched].sort((a, b) => b.stats.points - a.stats.points),
    [enriched]
  );

  const birthdays = useMemo(
    () => enriched.filter(({ customer }) => thisMonthBirthday(customer.birthday)),
    [enriched]
  );

  const totals = useMemo(() => {
    const totalCustomers = enriched.length;
    const totalRevenue = enriched.reduce((s, e) => s + e.stats.totalSpent, 0);
    const totalPoints = enriched.reduce((s, e) => s + e.stats.points, 0);
    return { totalCustomers, totalRevenue, totalPoints };
  }, [enriched]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setDialogOpen(true); };

  const handleDelete = () => {
    if (!confirmDelete) return;
    customerStore.remove(confirmDelete.id);
    toast.success(`Cliente ${confirmDelete.name} removido`);
    setConfirmDelete(null);
    refresh();
  };

  return (
    <PageShell
      title="Clientes"
      subtitle="CRM, histórico de pedidos e fidelidade"
      actions={
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Novo cliente
        </Button>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi icon={<UsersIcon className="w-4 h-4" />} label="Clientes" value={String(totals.totalCustomers)} />
        <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Receita total" value={`${totals.totalRevenue.toFixed(0)} MT`} />
        <Kpi icon={<Award className="w-4 h-4" />} label="Pontos em circulação" value={String(totals.totalPoints)} />
        <Kpi icon={<Cake className="w-4 h-4" />} label="Aniversários este mês" value={String(birthdays.length)} />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Pesquisar por nome, telefone ou email…"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-[140px]" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-[140px]" />
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const rows = buildCustomerReport(customers, orders, { from: fromDate || undefined, to: toDate || undefined });
            if (!rows.length) { toast.error('Sem dados'); return; }
            exportCustomersCSV(rows, { from: fromDate || undefined, to: toDate || undefined });
            toast.success('CSV exportado');
          }}>
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const rows = buildCustomerReport(customers, orders, { from: fromDate || undefined, to: toDate || undefined });
            if (!rows.length) { toast.error('Sem dados'); return; }
            exportCustomersPDF(rows, { from: fromDate || undefined, to: toDate || undefined });
            toast.success('PDF exportado');
          }}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Sync status */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        {!online && (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
            <CloudOff className="w-3 h-3 mr-1" /> Offline
          </Badge>
        )}
        {pendingSync > 0 ? (
          <>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {pendingSync} alteração(ões) por sincronizar
            </Badge>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => {
              const r = await flushQueue();
              if (r.skipped > 0) toast.message('Sem backend ligado', { description: `${r.skipped} op(s) aguardam ligação` });
              else if (r.pushed > 0) toast.success(`${r.pushed} op(s) sincronizadas`);
            }}>
              <RefreshCw className="w-3 h-3 mr-1" /> Tentar agora
            </Button>
          </>
        ) : (
          <Badge variant="outline" className="bg-success/10 text-success border-success/30">Tudo sincronizado localmente</Badge>
        )}
      </div>


      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Todos ({enriched.length})</TabsTrigger>
          <TabsTrigger value="loyalty">Fidelidade</TabsTrigger>
          <TabsTrigger value="birthdays">Aniversariantes ({birthdays.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <CustomerGrid items={filtered} onView={setDetail} onEdit={openEdit} onDelete={setConfirmDelete} />
        </TabsContent>

        <TabsContent value="loyalty">
          <Card className="p-4 mb-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <Gift className="w-4 h-4 text-primary" />
              <span>Cada <strong>10 MT</strong> gastos = <strong>1 ponto</strong>. Bronze &lt; 50 · Prata 50–199 · Ouro ≥ 200.</span>
            </div>
          </Card>
          <CustomerGrid items={loyaltyList} onView={setDetail} onEdit={openEdit} onDelete={setConfirmDelete} />
        </TabsContent>

        <TabsContent value="birthdays">
          {birthdays.length === 0 ? (
            <EmptyState icon={<Cake className="w-8 h-8" />} text="Nenhum aniversariante este mês" />
          ) : (
            <CustomerGrid items={birthdays} onView={setDetail} onEdit={openEdit} onDelete={setConfirmDelete} showBirthday />
          )}
        </TabsContent>
      </Tabs>

      {dialogOpen && (
        <CustomerDialog
          open={dialogOpen}
          customer={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); refresh(); }}
        />
      )}

      {detail && (
        <CustomerDetailDialog
          customer={detail}
          stats={computeStats(detail, orders)}
          onClose={() => setDetail(null)}
          onChanged={() => { refresh(); setDetail(customerStore.getAll().find(c => c.id === detail.id) || null); }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. {confirmDelete?.name} será removido. Os pedidos existentes não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

/* --------------------------------- UI bits -------------------------------- */

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
      <div className="font-heading text-xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card className="p-10 text-center text-muted-foreground">
      <div className="flex justify-center mb-2 opacity-60">{icon}</div>
      <p className="text-sm">{text}</p>
    </Card>
  );
}

function CustomerGrid({
  items, onView, onEdit, onDelete, showBirthday,
}: {
  items: { customer: Customer; stats: CustomerStats }[];
  onView: (c: Customer) => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  showBirthday?: boolean;
}) {
  if (items.length === 0) {
    return <EmptyState icon={<UsersIcon className="w-8 h-8" />} text="Nenhum cliente encontrado" />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {items.map(({ customer, stats }) => (
        <Card key={customer.id} className="p-4 hover:border-primary/40 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onView(customer)}>
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-semibold truncate">{customer.name}</h3>
                <Badge variant="outline" className={tierBadge(stats.tier)}>{stats.tier}</Badge>
              </div>
              {customer.phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Phone className="w-3 h-3" /> {customer.phone}
                </p>
              )}
              {showBirthday && customer.birthday && (
                <p className="text-xs text-primary flex items-center gap-1 mt-1">
                  <Cake className="w-3 h-3" /> {customer.birthday.slice(-5)}
                </p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={() => onEdit(customer)} aria-label="Editar">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => onDelete(customer)} aria-label="Remover">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <Stat label="Pedidos" value={String(stats.orderCount)} />
            <Stat label="Gasto" value={`${stats.totalSpent.toFixed(0)} MT`} />
            <Stat label="Pontos" value={String(stats.points)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/40 py-1.5">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

/* ------------------------------- Form dialog ------------------------------ */

function CustomerDialog({
  open, customer, onClose, onSaved,
}: {
  open: boolean; customer: Customer | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    nuit: customer?.nuit ?? '',
    birthday: customer?.birthday ?? '',
    notes: customer?.notes ?? '',
  });

  const errors = {
    name: form.name.trim().length < 2 ? 'Nome obrigatório' : null,
    phone: validateMpesa(form.phone), // mesmo formato 8X XXX XXXX
    nuit: form.nuit ? validateNuit(form.nuit) : null,
    birthday: form.birthday && !/^\d{2}-\d{2}$/.test(form.birthday)
      ? 'Use o formato MM-DD (ex: 03-15)' : null,
  };
  const hasErr = Object.values(errors).some(Boolean);

  const submit = () => {
    if (hasErr) { toast.error('Corrija os campos inválidos'); return; }
    const payload = {
      name: form.name.trim(),
      phone: form.phone,
      email: form.email || undefined,
      nuit: form.nuit || undefined,
      birthday: form.birthday || undefined,
      notes: form.notes || undefined,
    };
    if (customer) {
      customerStore.update(customer.id, payload);
      toast.success('Cliente atualizado');
    } else {
      customerStore.add(payload);
      toast.success('Cliente criado');
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <FieldRow label="Nome" error={errors.name}>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Telefone" error={errors.phone}>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: maskMzPhone(e.target.value) })} placeholder="84 123 4567" inputMode="numeric" />
            </FieldRow>
            <FieldRow label="Email">
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="opcional" />
            </FieldRow>
            <FieldRow label="NUIT" error={errors.nuit}>
              <Input value={form.nuit} onChange={e => setForm({ ...form, nuit: maskNuit(e.target.value) })} placeholder="opcional" inputMode="numeric" />
            </FieldRow>
            <FieldRow label="Aniversário (MM-DD)" error={errors.birthday}>
              <Input value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} placeholder="03-15" />
            </FieldRow>
          </div>
          <FieldRow label="Notas">
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Preferências, alergias…" rows={3} />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={hasErr}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ Detail dialog ----------------------------- */

function CustomerDetailDialog({
  customer, stats, onClose, onChanged,
}: {
  customer: Customer; stats: CustomerStats; onClose: () => void; onChanged: () => void;
}) {
  const [redeemQty, setRedeemQty] = useState('');

  const redeem = () => {
    const n = parseInt(redeemQty, 10);
    if (!n || n <= 0) { toast.error('Quantidade inválida'); return; }
    if (n > stats.points) { toast.error('Pontos insuficientes'); return; }
    customerStore.update(customer.id, {
      pointsAdjustment: (customer.pointsAdjustment || 0) - n,
    });
    toast.success(`${n} pontos resgatados`);
    setRedeemQty('');
    onChanged();
  };

  const addBonus = (n: number) => {
    customerStore.update(customer.id, {
      pointsAdjustment: (customer.pointsAdjustment || 0) + n,
    });
    toast.success(`+${n} pontos bónus`);
    onChanged();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {customer.name}
            <Badge variant="outline" className={tierBadge(stats.tier)}>{stats.tier}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pedidos" value={String(stats.orderCount)} />
          <Stat label="Total gasto" value={`${stats.totalSpent.toFixed(0)} MT`} />
          <Stat label="Pontos" value={String(stats.points)} />
        </div>

        {customer.phone && <p className="text-sm text-muted-foreground mt-2"><Phone className="w-3 h-3 inline mr-1" /> {customer.phone}</p>}
        {customer.notes && <p className="text-sm mt-2 p-3 rounded-md bg-secondary/40">{customer.notes}</p>}

        <div className="mt-4">
          <h4 className="font-heading text-sm font-semibold mb-2 flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" /> Fidelidade
          </h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Resgatar pontos</Label>
              <Input value={redeemQty} onChange={e => setRedeemQty(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" />
            </div>
            <Button onClick={redeem} variant="outline">Resgatar</Button>
            <Button onClick={() => addBonus(10)} variant="ghost" size="sm">+10 bónus</Button>
            <Button onClick={() => addBonus(50)} variant="ghost" size="sm">+50 bónus</Button>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="font-heading text-sm font-semibold mb-2">Histórico de pedidos ({stats.orders.length})</h4>
          {stats.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem pedidos pagos associados. Os pedidos são ligados pelo telefone do cliente no checkout.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {stats.orders
                .sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt))
                .map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/30 text-sm">
                    <div>
                      <div className="font-medium">Pedido #{o.id.slice(-6)} {o.tableNumber ? `· Mesa ${o.tableNumber}` : ''}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.closedAt || o.updatedAt).toLocaleString('pt-PT')} · {o.items.length} {o.items.length === 1 ? 'item' : 'itens'}
                      </div>
                    </div>
                    <div className="font-mono font-semibold">{(o.total ?? 0).toFixed(0)} MT</div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
