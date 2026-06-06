import { useMemo, useState, useEffect } from 'react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, differenceInMilliseconds, subMilliseconds } from 'date-fns';
import { pt } from 'date-fns/locale';
import PageShell from '@/components/PageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useRestaurant } from '@/hooks/useRestaurant';
import { staffStore, shiftStore } from '@/lib/store';
import { DollarSign, TrendingUp, ShoppingBag, Award, Package, Calendar as CalendarIcon, ArrowUp, ArrowDown, Minus, Download, FileText, FileSpreadsheet, ScrollText, UserCheck, XCircle, PlusCircle, Clock as ClockIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import type { Order, InventoryItem, Staff, Shift } from '@/types/restaurant';
import { exportReportsCSV, exportReportsPDF } from '@/lib/exportReports';
import { printBatchReceipts, downloadBatchReceiptsHTML } from '@/lib/receiptBatch';
import { loadSettings } from '@/lib/settings';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

type RangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

function getPresetRange(preset: RangePreset): { from: Date; to: Date } | null {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    default: return null;
  }
}

function computeStats(paidOrders: Order[], inventory: InventoryItem[]) {
  const totalRevenue = paidOrders.reduce((s, o) => s + o.total + (o.tip || 0), 0);
  const totalOrders = paidOrders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  let totalCost = 0;
  paidOrders.forEach(o => {
    o.items.forEach(item => {
      inventory.forEach(inv => {
        if (inv.linkedMenuItemIds.includes(item.menuItemId)) {
          totalCost += inv.costPerUnit * inv.usagePerServing * item.quantity;
        }
      });
    });
  });
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  return { totalRevenue, totalOrders, avgTicket, totalCost, profit, margin };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const formatMT = (n: number) => `${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MT`;
const formatHours = (totalSeconds: number) => {
  if (totalSeconds <= 0) return '0h 00m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--accent))',
  'hsl(var(--muted-foreground))',
];

export default function ReportsPage() {
  const { orders, inventory, menuItems } = useRestaurant();
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    setStaff(staffStore.getAll());
    setShifts(shiftStore.getAll());
  }, []);

  const activeRange = useMemo(() => {
    if (preset === 'all') return null;
    if (preset === 'custom') {
      if (customRange?.from) {
        return { start: startOfDay(customRange.from), end: endOfDay(customRange.to || customRange.from) };
      }
      return null;
    }
    const r = getPresetRange(preset);
    return r ? { start: r.from, end: r.to } : null;
  }, [preset, customRange]);

  const previousRange = useMemo(() => {
    if (!activeRange) return null;
    const span = differenceInMilliseconds(activeRange.end, activeRange.start);
    const prevEnd = subMilliseconds(activeRange.start, 1);
    const prevStart = subMilliseconds(prevEnd, span);
    return { start: prevStart, end: prevEnd };
  }, [activeRange]);

  const compareActive = compareEnabled && !!activeRange && !!previousRange;

  const paidOrders = useMemo(() => {
    const filtered = orders.filter(o => o.paid);
    if (!activeRange) return filtered;
    return filtered.filter(o => isWithinInterval(new Date(o.createdAt), { start: activeRange.start, end: activeRange.end }));
  }, [orders, activeRange]);

  const previousOrders = useMemo(() => {
    if (!previousRange) return [];
    return orders.filter(o => o.paid && isWithinInterval(new Date(o.createdAt), { start: previousRange.start, end: previousRange.end }));
  }, [orders, previousRange]);

  const rangeLabel = useMemo(() => {
    if (!activeRange) return 'Todo o período';
    return `${format(activeRange.start, 'dd MMM', { locale: pt })} – ${format(activeRange.end, 'dd MMM yyyy', { locale: pt })}`;
  }, [activeRange]);

  const previousLabel = useMemo(() => {
    if (!previousRange) return '';
    return `${format(previousRange.start, 'dd MMM', { locale: pt })} – ${format(previousRange.end, 'dd MMM yyyy', { locale: pt })}`;
  }, [previousRange]);

  const stats = useMemo(() => computeStats(paidOrders, inventory), [paidOrders, inventory]);
  const prevStats = useMemo(() => computeStats(previousOrders, inventory), [previousOrders, inventory]);


  // Revenue over time
  const revenueData = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number; profit: number }>();
    paidOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const key = period === 'daily'
        ? d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
        : d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
      const cur = map.get(key) || { revenue: 0, orders: 0, profit: 0 };
      const rev = o.total + (o.tip || 0);
      let cost = 0;
      o.items.forEach(item => {
        inventory.forEach(inv => {
          if (inv.linkedMenuItemIds.includes(item.menuItemId)) {
            cost += inv.costPerUnit * inv.usagePerServing * item.quantity;
          }
        });
      });
      map.set(key, {
        revenue: cur.revenue + rev,
        orders: cur.orders + 1,
        profit: cur.profit + (rev - cost),
      });
    });
    return Array.from(map.entries()).map(([label, v]) => ({ label, ...v })).slice(-14);
  }, [paidOrders, inventory, period]);

  // Best-selling items
  const bestSellers = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    paidOrders.forEach(o => {
      o.items.forEach(item => {
        const cur = map.get(item.menuItemId) || { name: item.name, quantity: 0, revenue: 0 };
        map.set(item.menuItemId, {
          name: item.name,
          quantity: cur.quantity + item.quantity,
          revenue: cur.revenue + item.price * item.quantity,
        });
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8);
  }, [paidOrders]);

  // Sales by category
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    paidOrders.forEach(o => {
      o.items.forEach(item => {
        const menu = menuItems.find(m => m.id === item.menuItemId);
        const cat = menu?.category || 'Outros';
        map.set(cat, (map.get(cat) || 0) + item.price * item.quantity);
      });
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [paidOrders, menuItems]);

  // Payment methods
  const paymentData = useMemo(() => {
    const map = new Map<string, number>();
    paidOrders.forEach(o => {
      const m = o.paymentMethod || 'cash';
      map.set(m, (map.get(m) || 0) + o.total + (o.tip || 0));
    });
    const labels: Record<string, string> = { cash: 'Dinheiro', card: 'Cartão', 'mobile-money': 'M-Pesa' };
    return Array.from(map.entries()).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [paidOrders]);

  // Audit log events: created / closed / cancelled within active range, optionally filtered by staff
  type AuditEvent = {
    kind: 'created' | 'closed' | 'cancelled';
    at: string;
    actorId?: string;
    actorName: string;
    actorRole?: string;
    orderId: string;
    tableNumber?: number;
    type: Order['type'];
    total: number;
  };

  const auditEvents = useMemo<AuditEvent[]>(() => {
    const events: AuditEvent[] = [];
    const inRange = (iso?: string) => {
      if (!iso) return false;
      if (!activeRange) return true;
      return isWithinInterval(new Date(iso), { start: activeRange.start, end: activeRange.end });
    };
    orders.forEach(o => {
      if (inRange(o.createdAt)) {
        events.push({
          kind: 'created',
          at: o.createdAt,
          actorId: o.createdBy?.id,
          actorName: o.createdBy?.name || 'Sistema',
          actorRole: o.createdBy?.role,
          orderId: o.id,
          tableNumber: o.tableNumber,
          type: o.type,
          total: o.total,
        });
      }
      if (o.closedAt && inRange(o.closedAt)) {
        events.push({
          kind: 'closed',
          at: o.closedAt,
          actorId: o.closedBy?.id,
          actorName: o.closedBy?.name || 'Sistema',
          actorRole: o.closedBy?.role,
          orderId: o.id,
          tableNumber: o.tableNumber,
          type: o.type,
          total: o.total + (o.tip || 0),
        });
      }
      if (o.cancelledAt && inRange(o.cancelledAt)) {
        events.push({
          kind: 'cancelled',
          at: o.cancelledAt,
          actorId: o.cancelledBy?.id,
          actorName: o.cancelledBy?.name || 'Sistema',
          actorRole: o.cancelledBy?.role,
          orderId: o.id,
          tableNumber: o.tableNumber,
          type: o.type,
          total: o.total,
        });
      }
    });
    const filtered = staffFilter === 'all'
      ? events
      : staffFilter === 'unknown'
        ? events.filter(e => !e.actorId)
        : events.filter(e => e.actorId === staffFilter);
    return filtered.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [orders, activeRange, staffFilter]);

  const auditSummary = useMemo(() => {
    const map = new Map<string, { name: string; role?: string; created: number; closed: number; cancelled: number; revenue: number }>();
    auditEvents.forEach(e => {
      const key = e.actorId || 'unknown';
      const cur = map.get(key) || { name: e.actorName, role: e.actorRole, created: 0, closed: 0, cancelled: 0, revenue: 0 };
      if (e.kind === 'created') cur.created += 1;
      if (e.kind === 'closed') { cur.closed += 1; cur.revenue += e.total; }
      if (e.kind === 'cancelled') cur.cancelled += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [auditEvents]);

  // Shift summary: total worked seconds per staff overlapping the active range, optional staff filter
  const shiftSummary = useMemo(() => {
    const rangeStart = activeRange?.start.getTime() ?? -Infinity;
    const rangeEnd = activeRange?.end.getTime() ?? Infinity;
    const refNow = Date.now();
    type Row = { staffId: string; name: string; role: string; sessions: number; openSessions: number; seconds: number };
    const map = new Map<string, Row>();

    const filteredShifts = shifts.filter(s => {
      if (staffFilter === 'all') return true;
      if (staffFilter === 'unknown') return false;
      return s.staffId === staffFilter;
    });

    filteredShifts.forEach(s => {
      const start = new Date(s.clockIn).getTime();
      const end = s.clockOut ? new Date(s.clockOut).getTime() : refNow;
      // overlap with [rangeStart, rangeEnd]
      const overlapStart = Math.max(start, rangeStart);
      const overlapEnd = Math.min(end, rangeEnd);
      if (overlapEnd <= overlapStart) return;
      const seconds = Math.floor((overlapEnd - overlapStart) / 1000);
      const cur = map.get(s.staffId) || {
        staffId: s.staffId,
        name: s.staffName,
        role: s.staffRole,
        sessions: 0,
        openSessions: 0,
        seconds: 0,
      };
      cur.sessions += 1;
      if (!s.clockOut) cur.openSessions += 1;
      cur.seconds += seconds;
      map.set(s.staffId, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
  }, [shifts, activeRange, staffFilter]);

  const shiftTotalSeconds = useMemo(
    () => shiftSummary.reduce((sum, r) => sum + r.seconds, 0),
    [shiftSummary]
  );

  const hasData = paidOrders.length > 0;

  const handleExport = (kind: 'pdf' | 'csv') => {
    if (!hasData) {
      toast.error('Sem dados para exportar no período selecionado');
      return;
    }
    const payload = {
      rangeLabel,
      previousLabel: compareActive ? previousLabel : undefined,
      compareActive,
      stats,
      prevStats: compareActive ? prevStats : undefined,
      bestSellers,
      categoryData,
      paymentData,
      revenueData,
    };
    try {
      if (kind === 'pdf') exportReportsPDF(payload);
      else exportReportsCSV(payload);
      toast.success(`Relatório ${kind.toUpperCase()} exportado`);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao exportar relatório');
    }
  };

  return (
    <PageShell
      title="Relatórios"
      subtitle={`Análise de vendas · ${rangeLabel}`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={preset} onValueChange={(v) => { setPreset(v as RangePreset); if (v !== 'custom') setCustomRange(undefined); }}>
            <TabsList className="h-9">
              <TabsTrigger value="today" className="text-xs">Hoje</TabsTrigger>
              <TabsTrigger value="week" className="text-xs">Semana</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Mês</TabsTrigger>
              <TabsTrigger value="all" className="text-xs">Tudo</TabsTrigger>
            </TabsList>
          </Tabs>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={preset === 'custom' ? 'default' : 'outline'}
                size="sm"
                className={cn('h-9 gap-2', preset !== 'custom' && 'text-muted-foreground')}
              >
                <CalendarIcon className="w-4 h-4" />
                {preset === 'custom' && customRange?.from
                  ? `${format(customRange.from, 'dd/MM')}${customRange.to ? ` – ${format(customRange.to, 'dd/MM')}` : ''}`
                  : 'Personalizado'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={(r) => {
                  setCustomRange(r);
                  setPreset('custom');
                  if (r?.from && r?.to) setPopoverOpen(false);
                }}
                numberOfMonths={1}
                locale={pt}
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          <div
            className={cn(
              'flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card',
              !activeRange && 'opacity-50'
            )}
          >
            <Switch
              id="compare-toggle"
              checked={compareEnabled}
              onCheckedChange={setCompareEnabled}
              disabled={!activeRange}
            />
            <Label htmlFor="compare-toggle" className="text-xs cursor-pointer whitespace-nowrap">
              Comparar
            </Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 gap-2" disabled={!hasData}>
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover z-50">
              <DropdownMenuItem onClick={() => handleExport('pdf')} className="gap-2 cursor-pointer">
                <FileText className="w-4 h-4" />
                Exportar PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="w-4 h-4" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (paidOrders.length === 0) { toast.info('Sem recibos no período'); return; }
                  printBatchReceipts(paidOrders, { brand: loadSettings().brandName, rangeLabel });
                }}
                className="gap-2 cursor-pointer"
              >
                <ScrollText className="w-4 h-4" />
                Imprimir recibos do período
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (paidOrders.length === 0) { toast.info('Sem recibos no período'); return; }
                  downloadBatchReceiptsHTML(paidOrders, { brand: loadSettings().brandName, rangeLabel });
                }}
                className="gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Guardar recibos (HTML)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="space-y-6">
      {!hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <TrendingUp className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Sem dados no período selecionado</p>
            <p className="text-sm">{activeRange ? 'Tente outro intervalo de datas' : 'Conclua pedidos no POS para ver os relatórios'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {compareActive && (
            <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
              <span className="font-medium text-foreground">Comparação:</span> {rangeLabel}
              <span className="mx-2">vs</span>
              <span className="font-medium text-foreground">{previousLabel}</span>
            </div>
          )}
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Receita Total"
              value={formatMT(stats.totalRevenue)}
              accent="text-success"
              compare={compareActive ? { previous: formatMT(prevStats.totalRevenue), change: pctChange(stats.totalRevenue, prevStats.totalRevenue) } : undefined}
            />
            <KpiCard
              icon={<ShoppingBag className="w-4 h-4" />}
              label="Pedidos Pagos"
              value={String(stats.totalOrders)}
              accent="text-primary"
              compare={compareActive ? { previous: String(prevStats.totalOrders), change: pctChange(stats.totalOrders, prevStats.totalOrders) } : undefined}
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Ticket Médio"
              value={formatMT(stats.avgTicket)}
              accent="text-accent"
              compare={compareActive ? { previous: formatMT(prevStats.avgTicket), change: pctChange(stats.avgTicket, prevStats.avgTicket) } : undefined}
            />
            <KpiCard
              icon={<Award className="w-4 h-4" />}
              label={`Lucro (${stats.margin.toFixed(1)}%)`}
              value={formatMT(stats.profit)}
              accent={stats.profit >= 0 ? 'text-success' : 'text-destructive'}
              compare={compareActive ? { previous: formatMT(prevStats.profit), change: pctChange(stats.profit, prevStats.profit) } : undefined}
            />
          </div>

          {/* Revenue chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" />
                Receita & Lucro
              </CardTitle>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as 'daily' | 'monthly')}>
                <TabsList className="h-8">
                  <TabsTrigger value="daily" className="text-xs">Diário</TabsTrigger>
                  <TabsTrigger value="monthly" className="text-xs">Mensal</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(v: number) => formatMT(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="revenue" name="Receita" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="profit" name="Lucro" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Best sellers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-warning" />
                  Mais Vendidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bestSellers} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="quantity" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Categories */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-accent" />
                  Vendas por Categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(e) => e.name}
                        labelLine={false}
                        fontSize={11}
                      >
                        {categoryData.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMT(v)} contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profit & Payment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Análise de Lucro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Receita Bruta" value={formatMT(stats.totalRevenue)} />
                <Row label="Custo de Ingredientes" value={`-${formatMT(stats.totalCost)}`} negative />
                <div className="border-t border-border pt-3">
                  <Row label="Lucro Líquido" value={formatMT(stats.profit)} bold positive={stats.profit >= 0} />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-muted-foreground">Margem</span>
                  <Badge variant={stats.margin >= 30 ? 'default' : stats.margin >= 15 ? 'secondary' : 'destructive'}>
                    {stats.margin.toFixed(1)}%
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Métodos de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        label={(e) => e.name}
                        fontSize={11}
                      >
                        {paymentData.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatMT(v)} contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Shift Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-primary" />
            Resumo de Turnos
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {formatHours(shiftTotalSeconds)}
            </Badge>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {staffFilter === 'all' ? 'todos os funcionários' : staffFilter === 'unknown' ? 'sem identificação' : staff.find(s => s.id === staffFilter)?.name || ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shiftSummary.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Sem turnos registados no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Funcionário</th>
                    <th className="px-3 py-2 font-medium">Função</th>
                    <th className="px-3 py-2 font-medium text-right">Sessões</th>
                    <th className="px-3 py-2 font-medium text-right">Horas</th>
                    <th className="px-3 py-2 font-medium text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftSummary.map(row => (
                    <tr key={row.staffId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{row.role}</td>
                      <td className="px-3 py-2 text-right text-foreground">{row.sessions}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{formatHours(row.seconds)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.openSessions > 0 ? (
                          <Badge variant="secondary" className="bg-success/15 text-success border-success/20 text-[10px]">Em curso</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td className="px-3 py-2 font-semibold text-foreground" colSpan={3}>Total</td>
                    <td className="px-3 py-2 text-right font-bold text-primary">{formatHours(shiftTotalSeconds)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-primary" />
            Registo de Auditoria
            <Badge variant="secondary" className="ml-1 text-[10px]">{auditEvents.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="staff-filter" className="text-xs text-muted-foreground whitespace-nowrap">
              Funcionário
            </Label>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger id="staff-filter" className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">Todos os funcionários</SelectItem>
                <SelectItem value="unknown">Sem identificação</SelectItem>
                {staff.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} <span className="text-muted-foreground">· {s.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {auditSummary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
              {auditSummary.map((s, i) => (
                <div key={i} className="rounded-lg border border-border bg-card/40 p-2.5">
                  <div className="text-xs font-semibold text-foreground truncate">{s.name}</div>
                  {s.role && <div className="text-[10px] text-muted-foreground capitalize">{s.role}</div>}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <span className="text-success">+{s.created}</span>
                    <span className="text-primary">✓{s.closed}</span>
                    {s.cancelled > 0 && <span className="text-destructive">✗{s.cancelled}</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-foreground">{formatMT(s.revenue)}</div>
                </div>
              ))}
            </div>
          )}

          {auditEvents.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Sem eventos registados {staffFilter !== 'all' ? 'para este funcionário' : 'no período selecionado'}.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2 font-medium">Evento</th>
                    <th className="px-3 py-2 font-medium">Funcionário</th>
                    <th className="px-3 py-2 font-medium">Pedido</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEvents.slice(0, 200).map((e, idx) => {
                    const Icon = e.kind === 'created' ? PlusCircle : e.kind === 'closed' ? UserCheck : XCircle;
                    const color = e.kind === 'created' ? 'text-success' : e.kind === 'closed' ? 'text-primary' : 'text-destructive';
                    const label = e.kind === 'created' ? 'Criado' : e.kind === 'closed' ? 'Fechado' : 'Cancelado';
                    const orderLabel = e.tableNumber ? `Mesa ${e.tableNumber}` : e.type === 'takeaway' ? 'Takeaway' : e.type === 'delivery' ? 'Entrega' : `#${e.orderId.slice(-4)}`;
                    return (
                      <tr key={idx} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.at), 'dd MMM HH:mm', { locale: pt })}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn('inline-flex items-center gap-1 font-medium', color)}>
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{e.actorName}</div>
                          {e.actorRole && <div className="text-[10px] text-muted-foreground capitalize">{e.actorRole}</div>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{orderLabel} <span className="opacity-60">#{e.orderId.slice(-4)}</span></td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{formatMT(e.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {auditEvents.length > 200 && (
                <div className="text-center text-[11px] text-muted-foreground py-2 border-t border-border">
                  A mostrar 200 de {auditEvents.length} eventos
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  compare,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  compare?: { previous: string; change: number | null };
}) {
  const change = compare?.change ?? null;
  const isUp = change !== null && change > 0.05;
  const isDown = change !== null && change < -0.05;
  const trendColor = isUp ? 'text-success' : isDown ? 'text-destructive' : 'text-muted-foreground';
  const TrendIcon = isUp ? ArrowUp : isDown ? ArrowDown : Minus;

  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 ${accent} mb-1`}>
          {icon}
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <div className="text-lg lg:text-xl font-bold text-foreground truncate">{value}</div>
        {compare && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {change === null ? (
              <span className="text-muted-foreground">— novo período</span>
            ) : (
              <>
                <span className={`inline-flex items-center gap-0.5 font-semibold ${trendColor}`}>
                  <TrendIcon className="w-3 h-3" />
                  {Math.abs(change).toFixed(1)}%
                </span>
                <span className="text-muted-foreground truncate">vs {compare.previous}</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, negative, positive }: { label: string; value: string; bold?: boolean; negative?: boolean; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`${bold ? 'text-lg font-bold' : 'text-sm font-medium'} ${negative ? 'text-destructive' : positive ? 'text-success' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
