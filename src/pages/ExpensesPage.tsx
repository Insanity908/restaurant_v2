import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Users, Percent, Droplets, Zap, Wallet, Plus, Pencil, Trash2, Save, Repeat, CalendarDays } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { staffStore } from '@/lib/store';
import { expenseStore, fetchExpenses, fetchStaffSalaries, getStaffSalaries, saveStaffSalary } from '@/lib/expenses';
import { formatMT } from '@/lib/billing';
import type { Staff, Expense, ExpenseCategory, UserRole } from '@/types/restaurant';
import { toast } from 'sonner';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super Admin', admin: 'Administrador', manager: 'Gerente',
  cashier: 'Caixa', waiter: 'Garçom', kitchen: 'Cozinha',
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = { water: 'Água', energy: 'Energia', other: 'Outra' };
const CATEGORY_ICON: Record<ExpenseCategory, typeof Droplets> = { water: Droplets, energy: Zap, other: Wallet };

interface FormState { name: string; category: ExpenseCategory; amount: string; recurring: boolean; expenseDate: string }
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm: FormState = { name: '', category: 'other', amount: '', recurring: true, expenseDate: today() };

export default function ExpensesPage() {
  const { user, catalogVersion } = useAuth();
  const { settings, update: updateSettings } = useSettings();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, string>>({});
  const [savingSalaryId, setSavingSalaryId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ivaDraft, setIvaDraft] = useState(String(settings.ivaRate));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // `catalogVersion` bumps quando o fetch de fundo do catálogo do tenant
  // (AuthContext) resolve — sem esta dependência, uma visita directa a
  // /expenses (refresh do browser, link) que monte esta página ANTES desse
  // fetch terminar lê `staffStore.getAll()` ainda vazio e fica presa nisso
  // (o efeito só corre uma vez), mostrando "Sem membros da equipe" mesmo
  // havendo equipa — mesmo padrão de useRestaurant.ts.
  useEffect(() => {
    setStaff(staffStore.getAll());
    setSalaries(getStaffSalaries());
    setExpenses(expenseStore.getAll());
    const t = user?.tenantId;
    if (!t) return;
    fetchStaffSalaries(t).then(setSalaries).catch(() => {});
    fetchExpenses(t).then(setExpenses).catch(() => {});
  }, [user?.tenantId, catalogVersion]);

  useEffect(() => { setIvaDraft(String(settings.ivaRate)); }, [settings.ivaRate]);

  const totalSalaries = useMemo(() => Object.values(salaries).reduce((s, v) => s + v, 0), [salaries]);
  // Só despesas recorrentes entram no "por mês" — uma compra pontual (ex.:
  // fritadeira) não deve inflacionar o custo fixo mensal todos os meses.
  const totalExpenses = useMemo(() => expenses.filter(e => e.recurring).reduce((s, e) => s + e.amount, 0), [expenses]);

  const saveSalary = async (staffId: string) => {
    const raw = salaryDrafts[staffId];
    const value = Number(raw ?? salaries[staffId] ?? 0);
    if (Number.isNaN(value) || value < 0) { toast.error('Valor inválido'); return; }
    setSavingSalaryId(staffId);
    await saveStaffSalary(staffId, value);
    setSalaries(prev => ({ ...prev, [staffId]: value }));
    setSalaryDrafts(prev => { const next = { ...prev }; delete next[staffId]; return next; });
    setSavingSalaryId(null);
    toast.success('Salário guardado');
  };

  const saveIva = () => {
    const value = Number(ivaDraft);
    if (Number.isNaN(value) || value < 0 || value > 100) { toast.error('Percentagem inválida (0–100)'); return; }
    updateSettings({ ivaRate: value });
    toast.success('IVA guardado');
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ name: e.name, category: e.category, amount: String(e.amount), recurring: e.recurring, expenseDate: e.expenseDate || today() });
    setOpen(true);
  };

  const saveExpense = () => {
    const amount = Number(form.amount);
    if (!form.name.trim()) { toast.error('Nome obrigatório'); return; }
    if (Number.isNaN(amount) || amount < 0) { toast.error('Valor inválido'); return; }
    if (!form.recurring && !form.expenseDate) { toast.error('Data obrigatória para despesa pontual'); return; }
    const payload = {
      name: form.name.trim(), category: form.category, amount,
      recurring: form.recurring, expenseDate: form.recurring ? '' : form.expenseDate,
    };
    if (editing) {
      expenseStore.update(editing.id, payload);
      toast.success('Despesa atualizada');
    } else {
      expenseStore.add(payload);
      toast.success('Despesa adicionada');
    }
    setExpenses(expenseStore.getAll());
    setOpen(false);
  };

  const removeExpense = (e: Expense) => {
    expenseStore.remove(e.id);
    setExpenses(expenseStore.getAll());
    toast.success('Despesa removida');
  };

  return (
    <PageShell title="Despesas" subtitle="Salários, IVA e outras despesas fixas — entram no lucro líquido em Relatórios">
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Salários</p>
            <p className="font-heading text-xl font-bold mt-1">{formatMT(totalSalaries)}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Outras despesas</p>
            <p className="font-heading text-xl font-bold mt-1">{formatMT(totalExpenses)}</p>
          </div>
          <div className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Percent className="w-3.5 h-3.5" /> IVA</p>
            <p className="font-heading text-xl font-bold mt-1">{settings.ivaRate}%</p>
          </div>
          <div className="glass rounded-xl p-4 bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground">Total fixo /mês</p>
            <p className="font-heading text-xl font-bold mt-1">{formatMT(totalSalaries + totalExpenses)}</p>
          </div>
        </div>

        <Tabs defaultValue="salaries" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full lg:w-auto">
            <TabsTrigger value="salaries"><Users className="w-4 h-4 mr-2" />Salários</TabsTrigger>
            <TabsTrigger value="iva"><Percent className="w-4 h-4 mr-2" />IVA</TabsTrigger>
            <TabsTrigger value="other"><Wallet className="w-4 h-4 mr-2" />Outras despesas</TabsTrigger>
          </TabsList>

          <TabsContent value="salaries" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Salário mensal (MT) de cada membro da equipe. Só visível para o administrador.
            </p>
            {staff.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">
                Sem membros da equipe registados em Team.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {staff.map(s => {
                  const draft = salaryDrafts[s.id] ?? String(salaries[s.id] ?? 0);
                  const dirty = salaryDrafts[s.id] !== undefined;
                  return (
                    <div key={s.id} className="glass rounded-xl p-4 space-y-3">
                      <div>
                        <h3 className="font-heading font-semibold truncate">{s.name}</h3>
                        <Badge variant="outline" className="mt-1 text-xs">{ROLE_LABEL[s.role]}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0} value={draft}
                          onChange={e => setSalaryDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                          className="h-9"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">MT/mês</span>
                      </div>
                      <Button
                        size="sm" variant={dirty ? 'default' : 'outline'} className="w-full"
                        disabled={!dirty || savingSalaryId === s.id}
                        onClick={() => saveSalary(s.id)}
                      >
                        <Save className="w-3.5 h-3.5" /> {savingSalaryId === s.id ? 'A guardar…' : 'Guardar'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="iva" className="space-y-3">
            <div className="glass rounded-xl p-5 max-w-sm space-y-4">
              <div>
                <p className="text-sm font-medium">Taxa de IVA</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Percentagem da receita descontada como IVA no lucro líquido de Relatórios.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="iva-rate">Percentagem (%)</Label>
                <Input
                  id="iva-rate" type="number" min={0} max={100} step="0.1"
                  value={ivaDraft} onChange={e => setIvaDraft(e.target.value)}
                />
              </div>
              <Button onClick={saveIva} disabled={ivaDraft === String(settings.ivaRate)}>
                <Save className="w-4 h-4" /> Guardar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="other" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={openNew}>
                <Plus className="w-4 h-4" /> Nova despesa
              </Button>
            </div>
            {expenses.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center text-sm text-muted-foreground">
                Sem outras despesas registadas (água, energia, etc.).
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {expenses.map(e => {
                  const Icon = CATEGORY_ICON[e.category];
                  return (
                    <div key={e.id} className="glass rounded-xl p-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <h3 className="font-heading font-semibold truncate">{e.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[e.category]}</Badge>
                          <Badge variant="outline" className="text-xs gap-1">
                            {e.recurring ? <Repeat className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
                            {e.recurring ? 'Recorrente' : (e.expenseDate ? new Date(e.expenseDate).toLocaleDateString('pt-PT') : 'Pontual')}
                          </Badge>
                        </div>
                        <p className="text-lg font-bold mt-2">{formatMT(e.amount)}{e.recurring && <span className="text-xs font-normal text-muted-foreground"> /mês</span>}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(e)} aria-label="Editar">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Remover">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover {e.name}?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeExpense(e)}>Remover</AlertDialogAction>
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
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar despesa' : 'Nova despesa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="expense-name">Nome</Label>
              <Input id="expense-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={60} placeholder="Ex.: Água, Energia, Renda" />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v: ExpenseCategory) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="water">Água</SelectItem>
                  <SelectItem value="energy">Energia</SelectItem>
                  <SelectItem value="other">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Despesa recorrente</p>
                <p className="text-xs text-muted-foreground">Entra todos os meses (ex.: água, energia, renda)</p>
              </div>
              <Switch checked={form.recurring} onCheckedChange={v => setForm(f => ({ ...f, recurring: v, expenseDate: v ? f.expenseDate : (f.expenseDate || today()) }))} />
            </div>
            {!form.recurring && (
              <div className="space-y-2">
                <Label htmlFor="expense-date">Data da despesa</Label>
                <Input id="expense-date" type="date" value={form.expenseDate} onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="expense-amount">{form.recurring ? 'Valor mensal (MT)' : 'Valor (MT)'}</Label>
              <Input id="expense-amount" type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={saveExpense}>{editing ? 'Guardar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
