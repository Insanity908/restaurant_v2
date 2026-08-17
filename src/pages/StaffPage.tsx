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
import { Plus, Pencil, Trash2, Users, KeyRound } from 'lucide-react';
import { Staff, UserRole } from '@/types/restaurant';
import { staffStore } from '@/lib/store';
import { useAuth } from '@/context/AuthContext';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS, PERMISSION_LABELS, getStaffPermissions, setStaffPermissions, resetStaffPermissions, type Permission } from '@/lib/permissions';
import { validateIntlPhone, maskIntlPhone } from '@/lib/validators';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { errorBodyMessage, extractFunctionErrorMessage } from '@/lib/functionError';
import { useLicense } from '@/hooks/useLicense';
import { BASIC_LIMITS } from '@/lib/billing';

// Nota: 'superadmin' é um papel de plataforma (gestão de todos os
// restaurantes), nunca um funcionário de uma unidade — por isso não aparece
// aqui nem é atribuível a partir desta página.
const ROLES: { value: UserRole; label: string; tone: string }[] = [
  { value: 'admin', label: 'Administrador', tone: 'bg-primary/15 text-primary border-primary/30' },
  { value: 'manager', label: 'Gerente', tone: 'bg-success/15 text-success border-success/30' },
  { value: 'cashier', label: 'Caixa', tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { value: 'waiter', label: 'Garçom', tone: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { value: 'kitchen', label: 'Cozinha', tone: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
];

const roleMeta = (role: UserRole) => ROLES.find(r => r.value === role) ?? { value: role, label: role, tone: '' };

// Membros locais/demo (sem conta real no Supabase Auth) usam ids gerados no
// cliente, não UUIDs — só vale a pena chamar delete-staff-account para quem
// tem mesmo uma conta real.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

interface FormState {
  name: string;
  role: UserRole;
  phone: string;
  password: string;
}

const empty: FormState = { name: '', role: 'waiter', phone: '', password: '' };

export default function StaffPage() {
  const { user, hasPermission } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [permsTarget, setPermsTarget] = useState<Staff | null>(null);
  const [permsSel, setPermsSel] = useState<Set<Permission>>(new Set());
  const canManagePerms = user?.role === 'admin' || user?.role === 'superadmin';
  const canManageStaff = hasPermission('staff.manage');
  const { isBasic } = useLicense();

  const refresh = () => {
    setStaff(staffStore.getAll());
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
    if (isBasic && staff.length >= BASIC_LIMITS.maxStaff) {
      toast.error(`Limite de ${BASIC_LIMITS.maxStaff} funcionários do plano Básico atingido`, {
        description: 'Mude para o plano Profissional para ter funcionários ilimitados.',
      });
      return;
    }
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const [saving, setSaving] = useState(false);

  const openEdit = (s: Staff) => {
    setEditing(s);
    setForm({ name: s.name, role: s.role, phone: '', password: '' });
    setOpen(true);
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Nome obrigatório';
    if (form.name.trim().length > 60) return 'Nome demasiado longo';
    if (!assignableRoles.some(r => r.value === form.role)) return 'Não tem permissão para atribuir este papel';
    // Login credentials (phone/password) are only required when creating a
    // new member — editing keeps the existing login untouched.
    if (!editing) {
      const phone = form.phone.trim();
      if (!phone) return 'Indique um telefone';
      const phoneErr = validateIntlPhone(phone);
      if (phoneErr) return phoneErr;
      if (form.password.length < 8) return 'Password deve ter pelo menos 8 caracteres';
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (editing) {
      staffStore.update(editing.id, { name: form.name.trim(), role: form.role });
      toast.success('Funcionário atualizado');
      refresh();
      setOpen(false);
      return;
    }

    setSaving(true);
    const tenantId = localStorage.getItem('current_tenant_id');
    if (!tenantId) { toast.error('Sem restaurante ativo'); setSaving(false); return; }

    const { data, error } = await supabase.functions.invoke('create-staff-account', {
      body: {
        tenantId,
        name: form.name.trim(),
        role: form.role,
        phone: form.phone.trim(),
        password: form.password,
      },
    });
    setSaving(false);
    if (error || !data?.userId) {
      const serverMessage = await extractFunctionErrorMessage(error);
      toast.error(serverMessage || errorBodyMessage(data) || error?.message || 'Falha ao criar conta do funcionário');
      return;
    }

    staffStore.add({ id: data.userId as string, name: form.name.trim(), role: form.role });
    toast.success('Funcionário adicionado');
    refresh();
    setOpen(false);
  };

  const remove = async (s: Staff) => {
    if (s.id === user?.id) {
      toast.error('Não pode eliminar a sua própria conta');
      return;
    }
    if (s.role === 'admin' && staff.filter(x => x.role === 'admin').length === 1) {
      toast.error('Deve existir pelo menos um administrador');
      return;
    }
    const tenantId = localStorage.getItem('current_tenant_id');
    if (tenantId && isUuid(s.id)) {
      // Também apaga a conta de autenticação real (não só o registo local) —
      // sem isto o login/telefone da pessoa ficava activo para sempre depois
      // de "removida". staffStore.remove abaixo continua a limpar o cache
      // local e a tabela legada `staff`, independentemente disto.
      const { error } = await supabase.functions.invoke('delete-staff-account', {
        body: { tenantId, userId: s.id },
      });
      if (error) {
        toast.error('Não foi possível remover o acesso do funcionário; tente novamente');
        return;
      }
    }
    staffStore.remove(s.id);
    toast.success('Funcionário removido');
    refresh();
  };

  return (
    <PageShell
      title="Funcionários"
      subtitle="Gerir equipa e acessos"
      actions={
        canManageStaff ? (
          <Button onClick={openNew}>
            <Plus className="w-4 h-4" /> Novo funcionário
          </Button>
        ) : undefined
      }
    >

      {/* Role summary — admin não conta como "funcionário" aqui */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ROLES.filter(r => r.value !== 'admin').map(r => (
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
                    {canManagePerms && (
                      <Button size="icon" variant="ghost" aria-label="Permissões" onClick={() => {
                        setPermsTarget(s);
                        setPermsSel(new Set(getStaffPermissions(s.id, s.role)));
                      }}>
                        <KeyRound className="w-4 h-4" />
                      </Button>
                    )}
                    {canManageStaff && (
                      <>
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
                      </>
                    )}
                  </div>
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
            {!editing && (
              <>
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Acesso ao sistema (login)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-phone">Telefone</Label>
                  <Input id="staff-phone" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: maskIntlPhone(e.target.value) }))}
                    placeholder="+258 84 123 4567" autoComplete="tel" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-password">Password</Label>
                  <Input id="staff-password" type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                  <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. Entra com este telefone.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'A guardar…' : editing ? 'Guardar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permsTarget} onOpenChange={o => !o && setPermsTarget(null)}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissões · {permsTarget?.name}</DialogTitle>
          </DialogHeader>
          {permsTarget && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ajuste as permissões deste funcionário. Por padrão são as do papel <strong>{roleMeta(permsTarget.role).label}</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30">
                    <span className="text-xs">{PERMISSION_LABELS[p]}</span>
                    <Switch
                      checked={permsSel.has(p)}
                      onCheckedChange={(v) => setPermsSel(prev => {
                        const next = new Set(prev);
                        if (v) next.add(p); else next.delete(p);
                        return next;
                      })}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => {
              if (!permsTarget) return;
              resetStaffPermissions(permsTarget.id)
                .then(() => {
                  setPermsSel(new Set(DEFAULT_PERMISSIONS[permsTarget.role]));
                  toast.success('Restaurado ao padrão do papel');
                })
                .catch((e: Error) => toast.error(e.message));
            }}>Restaurar padrão</Button>
            <Button variant="outline" onClick={() => setPermsTarget(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!permsTarget) return;
              setStaffPermissions(permsTarget.id, Array.from(permsSel))
                .then(() => { toast.success('Permissões guardadas'); setPermsTarget(null); })
                .catch((e: Error) => toast.error(e.message));
            }}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

