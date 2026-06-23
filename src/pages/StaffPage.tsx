import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Users, ShieldCheck } from 'lucide-react';
import { SecurityAlert, Staff, UserRole } from '@/types/restaurant';
import { securityAlertStore, staffStore } from '@/lib/store';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const ROLES: { value: UserRole; label: string; tone: string }[] = [
  { value: 'superadmin', label: 'Super Admin', tone: 'bg-destructive/15 text-destructive border-destructive/30' },
  { value: 'admin', label: 'Administrador', tone: 'bg-primary/15 text-primary border-primary/30' },
  { value: 'manager', label: 'Gerente', tone: 'bg-success/15 text-success border-success/30' },
  { value: 'cashier', label: 'Caixa', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'waiter', label: 'Garçom', tone: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { value: 'kitchen', label: 'Cozinha', tone: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
];

const roleMeta = (role: UserRole) => ROLES.find(r => r.value === role)!;

interface FormState {
  name: string;
  role: UserRole;
  pin: string;
}

const empty: FormState = { name: '', role: 'waiter', pin: '' };

export default function StaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const refresh = () => {
    setStaff(staffStore.getAll());
    setSecurityAlerts(securityAlertStore.getAll());
  };
  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => {
    const map: Record<UserRole, number> = { superadmin: 0, admin: 0, manager: 0, cashier: 0, waiter: 0, kitchen: 0 };
    staff.forEach(s => { map[s.role]++; });
    return map;
  }, [staff]);

  // Managers can only assign non-elevated roles. Admins can also create managers.
  const assignableRoles = ROLES.filter(r => {
    if (user?.role === 'superadmin') return r.value !== 'superadmin';
    if (user?.role === 'admin') return r.value !== 'superadmin' && r.value !== 'admin';
    if (user?.role === 'manager') return r.value === 'cashier' || r.value === 'waiter' || r.value === 'kitchen';
    return false;
  });

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({ name: s.name, role: s.role, pin: s.pin || '' });
    setOpen(true);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Nome obrigatório';
    if (form.name.trim().length > 60) return 'Nome demasiado longo';
    if (!/^\d{4,6}$/.test(form.pin)) return 'PIN deve ter 4 a 6 dígitos';
    if (!assignableRoles.some(r => r.value === form.role)) return 'Não tem permissão para atribuir este papel';
    const conflict = staffStore.getAll().find(s => s.pin === form.pin && s.id !== editing?.id);
    if (conflict) return 'PIN já em uso';
    return null;
  };

  const save = () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (editing) {
      staffStore.update(editing.id, { name: form.name.trim(), role: form.role, pin: form.pin });
      toast.success('Funcionário atualizado');
    } else {
      staffStore.add({ name: form.name.trim(), role: form.role, pin: form.pin });
      toast.success('Funcionário adicionado');
    }
    refresh();
    setOpen(false);
  };

  const remove = (s: Staff) => {
    if (s.id === user?.id) {
      toast.error('Não pode eliminar a sua própria conta');
      return;
    }
    if (s.role === 'admin' && staff.filter(x => x.role === 'admin').length === 1) {
      toast.error('Deve existir pelo menos um administrador');
      return;
    }
    staffStore.remove(s.id);
    toast.success('Funcionário removido');
    refresh();
  };

  const confirmAlerts = () => {
    securityAlertStore.clearAll();
    refresh();
    toast.success('Alertas confirmados e removidos');
  };

  const dismissAlert = (id: string) => {
    securityAlertStore.remove(id);
    refresh();
  };

  return (
    <PageShell
      title="Funcionários"
      subtitle="Gerir equipa e controlo de acesso por PIN"
      actions={
        <Button onClick={openNew}>
          <Plus className="w-4 h-4" /> Novo funcionário
        </Button>
      }
    >
      {securityAlerts.length > 0 && (
        <div className="glass rounded-xl p-4 mb-6 border border-destructive/30">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-heading font-semibold text-destructive">Alertas de segurança</p>
              <p className="text-xs text-muted-foreground">Tentativas falhadas de PIN para revisão do gerente e administrador.</p>
            </div>
            <Button size="sm" variant="outline" onClick={confirmAlerts}>Confirmar e remover</Button>
          </div>
          <div className="space-y-2">
            {securityAlerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="flex items-start justify-between gap-3 rounded-lg bg-secondary/40 p-3 text-sm">
                <div className="flex-1">
                  <p className="text-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleString('pt-MZ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!alert.read && <Badge variant="destructive">Novo</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => dismissAlert(alert.id)}>Confirmar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {ROLES.map(r => (
          <div key={r.value} className="glass rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="font-heading text-2xl font-bold mt-1">{counts[r.value]}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="w-16 h-16 mb-4 opacity-30" />
          <p>Nenhum funcionário registado</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {staff.map(s => {
            const meta = roleMeta(s.role);
            const isMe = s.id === user?.id;
            return (
              <div key={s.id} className="glass rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-semibold truncate">{s.name}</h3>
                      {isMe && <Badge variant="outline" className="text-xs">Você</Badge>}
                    </div>
                    <Badge variant="outline" className={`mt-1 ${meta.tone}`}>{meta.label}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label="Editar">
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
                          <AlertDialogTitle>Remover {s.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação é permanente e o funcionário perderá acesso ao sistema.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(s)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  PIN: <code className="text-foreground">{'•'.repeat((s.pin || '').length)}</code>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={form.role} onValueChange={(v: UserRole) => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4 a 6 dígitos)</Label>
              <Input
                id="pin"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Guardar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
