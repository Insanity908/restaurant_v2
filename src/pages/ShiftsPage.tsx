import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, endOfDay, isWithinInterval, differenceInSeconds } from 'date-fns';
import { pt } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, LogIn, LogOut, Calendar as CalendarIcon, Users, Hourglass, Pencil, Download } from 'lucide-react';
import PageShell from '@/components/PageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { shiftStore, staffStore, fetchShifts } from '@/lib/store';
import { exportShiftsCSV } from '@/lib/exportReports';
import type { Shift, Staff } from '@/types/restaurant';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

function shiftSeconds(s: Shift, now: Date): number {
  const start = new Date(s.clockIn).getTime();
  const end = s.clockOut ? new Date(s.clockOut).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - start) / 1000));
}

// Formato exigido por <input type="datetime-local">: "YYYY-MM-DDTHH:mm" em
// hora local, sem timezone — `toISOString()` dá UTC, por isso não serve aqui.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShiftsPage() {
  const { user, hasPermission } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [now, setNow] = useState(new Date());
  const [scope, setScope] = useState<'me' | 'all'>('me');
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const isManager = hasPermission('shifts.manage');

  const refresh = () => {
    setShifts(shiftStore.getAll());
    setStaff(staffStore.getAll());
  };

  useEffect(() => {
    refresh();
    if (user?.tenantId) {
      void fetchShifts(user.tenantId).then(() => refresh()).catch(() => {});
    }
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);


  const myActive = useMemo(
    () => (user ? shifts.find(s => s.staffId === user.id && !s.clockOut) : undefined),
    [shifts, user]
  );

  const todayRange = { start: startOfDay(now), end: endOfDay(now) };

  const visibleShifts = useMemo(() => {
    const filtered = scope === 'me' && user
      ? shifts.filter(s => s.staffId === user.id)
      : shifts;
    return [...filtered].sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
  }, [shifts, scope, user]);

  // Filtro de datas aplica-se só ao histórico (tabela + exportação) — os
  // cartões de "hoje" no topo mantêm-se sempre relativos a `now`.
  const historyShifts = useMemo(() => {
    if (!dateFrom && !dateTo) return visibleShifts;
    const from = dateFrom ? startOfDay(new Date(dateFrom)) : null;
    const to = dateTo ? endOfDay(new Date(dateTo)) : null;
    return visibleShifts.filter(s => {
      const t = new Date(s.clockIn).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [visibleShifts, dateFrom, dateTo]);

  const handleExport = () => {
    exportShiftsCSV(historyShifts.map(s => ({
      date: format(new Date(s.clockIn), 'dd/MM/yyyy'),
      staffName: s.staffName,
      staffRole: s.staffRole,
      clockIn: format(new Date(s.clockIn), 'HH:mm'),
      clockOut: s.clockOut ? format(new Date(s.clockOut), 'HH:mm') : undefined,
      durationLabel: formatDuration(shiftSeconds(s, now)),
    })));
  };

  const todayShifts = useMemo(
    () => visibleShifts.filter(s => isWithinInterval(new Date(s.clockIn), todayRange)),
    [visibleShifts, now]
  );

  const todayTotalSeconds = useMemo(
    () => todayShifts.reduce((sum, s) => sum + shiftSeconds(s, now), 0),
    [todayShifts, now]
  );

  // Currently clocked-in across all staff (manager view)
  const activeNow = useMemo(() => shifts.filter(s => !s.clockOut), [shifts]);

  // Per-staff today summary
  const todayPerStaff = useMemo(() => {
    const map = new Map<string, { name: string; role: string; seconds: number; sessions: number; active: boolean }>();
    shifts
      .filter(s => isWithinInterval(new Date(s.clockIn), todayRange))
      .forEach(s => {
        const cur = map.get(s.staffId) || { name: s.staffName, role: s.staffRole, seconds: 0, sessions: 0, active: false };
        cur.seconds += shiftSeconds(s, now);
        cur.sessions += 1;
        if (!s.clockOut) cur.active = true;
        map.set(s.staffId, cur);
      });
    return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
  }, [shifts, now]);

  const handleClockIn = () => {
    if (!user) return;
    if (myActive) {
      toast.error('Já tem um turno ativo');
      return;
    }
    shiftStore.clockIn(user);
    toast.success('Entrada registada');
    refresh();
  };

  const handleClockOut = () => {
    if (!user) return;
    if (!myActive) {
      toast.error('Sem turno ativo');
      return;
    }
    shiftStore.clockOut(user.id);
    toast.success('Saída registada');
    refresh();
  };

  const openEdit = (s: Shift) => {
    setEditingShift(s);
    setEditClockIn(toLocalInputValue(s.clockIn));
    setEditClockOut(s.clockOut ? toLocalInputValue(s.clockOut) : '');
  };

  const saveEdit = () => {
    if (!editingShift || !editClockIn) return;
    const clockIn = new Date(editClockIn).toISOString();
    const clockOut = editClockOut ? new Date(editClockOut).toISOString() : undefined;
    if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
      toast.error('A saída deve ser depois da entrada');
      return;
    }
    shiftStore.update(editingShift.id, { clockIn, clockOut });
    toast.success('Turno atualizado');
    setEditingShift(null);
    refresh();
  };

  if (!user) return null;

  return (
    <PageShell
      title="Turnos"
      subtitle="Controlo de entradas e saídas"
      actions={
        isManager ? (
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'me' | 'all')}>
            <TabsList className="h-9">
              <TabsTrigger value="me" className="text-xs">Eu</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">Equipa</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Clock card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6 md:justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  'w-16 h-16 rounded-2xl flex items-center justify-center',
                  myActive ? 'bg-success/15 text-success' : 'bg-secondary text-muted-foreground'
                )}>
                  <Clock className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sessão de</p>
                  <p className="font-heading font-bold text-lg text-foreground">{user.name}</p>
                  <AnimatePresence mode="wait">
                    {myActive ? (
                      <motion.p
                        key="active"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm text-success font-medium mt-0.5"
                      >
                        Em turno · {formatDuration(shiftSeconds(myActive, now))}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="idle"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm text-muted-foreground mt-0.5"
                      >
                        Fora de turno
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="lg"
                  onClick={handleClockIn}
                  disabled={!!myActive}
                  className="gap-2 bg-success hover:bg-success/90 text-success-foreground disabled:opacity-40"
                >
                  <LogIn className="w-4 h-4" />
                  Entrada
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleClockOut}
                  disabled={!myActive}
                  className="gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Saída
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-border">
              <Stat
                icon={<Hourglass className="w-4 h-4" />}
                label={scope === 'all' ? 'Horas hoje (equipa)' : 'Horas hoje'}
                value={formatDuration(todayTotalSeconds)}
                accent="text-primary"
              />
              <Stat
                icon={<CalendarIcon className="w-4 h-4" />}
                label="Sessões hoje"
                value={String(todayShifts.length)}
                accent="text-accent"
              />
              <Stat
                icon={<Users className="w-4 h-4" />}
                label="Em turno agora"
                value={String(activeNow.length)}
                accent="text-success"
              />
            </div>
          </CardContent>
        </Card>

        {/* Today per-staff (manager only when scope=all) */}
        {isManager && scope === 'all' && todayPerStaff.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Resumo de Hoje · Por Funcionário
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {todayPerStaff.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{p.role} · {p.sessions} sessão{p.sessions === 1 ? '' : 'es'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">{formatDuration(p.seconds)}</div>
                      {p.active && (
                        <Badge variant="secondary" className="text-[10px] bg-success/15 text-success border-success/20">Ativo</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* History */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Histórico de Turnos
                <Badge variant="secondary" className="ml-1 text-[10px]">{historyShifts.length}</Badge>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="Data inicial" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-[140px] text-xs" aria-label="Data final" />
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExport} disabled={historyShifts.length === 0}>
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {historyShifts.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Sem turnos registados{(dateFrom || dateTo) ? ' neste período.' : '.'}
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Data</th>
                      {scope === 'all' && <th className="px-3 py-2 font-medium">Funcionário</th>}
                      <th className="px-3 py-2 font-medium">Entrada</th>
                      <th className="px-3 py-2 font-medium">Saída</th>
                      <th className="px-3 py-2 font-medium text-right">Duração</th>
                      {isManager && <th className="px-3 py-2 font-medium text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {historyShifts.slice(0, 200).map(s => (
                      <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {format(new Date(s.clockIn), 'dd MMM yyyy', { locale: pt })}
                        </td>
                        {scope === 'all' && (
                          <td className="px-3 py-2">
                            <div className="font-medium text-foreground">{s.staffName}</div>
                            <div className="text-[10px] text-muted-foreground capitalize">{s.staffRole}</div>
                          </td>
                        )}
                        <td className="px-3 py-2 text-foreground">{format(new Date(s.clockIn), 'HH:mm')}</td>
                        <td className="px-3 py-2">
                          {s.clockOut ? (
                            <span className="text-foreground">{format(new Date(s.clockOut), 'HH:mm')}</span>
                          ) : (
                            <Badge variant="secondary" className="bg-success/15 text-success border-success/20 text-[10px]">Em curso</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {formatDuration(shiftSeconds(s, now))}
                        </td>
                        {isManager && (
                          <td className="px-3 py-2 text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingShift} onOpenChange={(open) => { if (!open) setEditingShift(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar turno {editingShift ? `· ${editingShift.staffName}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="shift-clock-in">Entrada</Label>
              <Input id="shift-clock-in" type="datetime-local" value={editClockIn} onChange={e => setEditClockIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-clock-out">Saída</Label>
              <Input id="shift-clock-out" type="datetime-local" value={editClockOut} onChange={e => setEditClockOut(e.target.value)} />
              <p className="text-xs text-muted-foreground">Deixe em branco para manter o turno "Em curso".</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShift(null)}>Cancelar</Button>
            <Button onClick={saveEdit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div>
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground mb-1', accent)}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base lg:text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}
