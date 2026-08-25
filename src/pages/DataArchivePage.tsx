import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Archive, TrendingUp, ShoppingBag, Award, FileText, FileSpreadsheet, ScrollText,
  Trash2, AlertTriangle, Loader2, ShieldAlert, Clock as ClockIcon, Download, PackageCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { useRestaurant } from '@/hooks/useRestaurant';
import { fetchOrdersInRange, fetchShiftsInRange, fetchSecurityAlertsInRange, fetchArchivedReports, type ArchivedReport } from '@/lib/dataArchive';
import { fetchFixedCosts, type PeriodFixedCosts } from '@/lib/expenses';
import { fetchOrders, fetchShifts } from '@/lib/store';
import { exportYearReportPDF, exportYearReportCSV, type YearReportPayload } from '@/lib/exportReports';
import { exportYearReportExcel } from '@/lib/exportExcel';
import { downloadBatchReceiptsHTML } from '@/lib/receiptBatch';
import { supabase } from '@/integrations/supabase/client';
import { resolveStorageUrl, ARCHIVED_REPORTS_BUCKET } from '@/lib/storage';
import type { Order, Shift } from '@/types/restaurant';

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const formatMT = (n: number) => `${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MT`;
const formatHours = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const ZERO_FIXED: PeriodFixedCosts = { recurringMonthly: 0, oneTime: 0 };
const CONFIRM_WORD = 'APAGAR';

function monthsInSelection(year: number, month: number | null): number {
  if (month !== null) return 1;
  const now = new Date();
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth() + 1; // ano corrente ainda a decorrer — só os meses já passados
}

export default function DataArchivePage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { menuItems, inventory, refresh } = useRestaurant();

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d;
  }, []);

  const [year, setYear] = useState<number>(currentYear - 1);
  const [month, setMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearOrders, setYearOrders] = useState<Order[]>([]);
  const [yearShifts, setYearShifts] = useState<Shift[]>([]);
  const [alertsCount, setAlertsCount] = useState<number | null>(null);
  const [fixedCosts, setFixedCosts] = useState<PeriodFixedCosts>(ZERO_FIXED);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [receiptsDownloaded, setReceiptsDownloaded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Anos/meses já arquivados sozinhos pelo cron (archive-old-years) — só
  // leitura, para o admin poder descarregar o Excel de um período cujos
  // dados em bruto já não existem. Nada aqui depende de o admin ter gerado
  // nada nesta página; aparece assim que existir.
  const [archivedReports, setArchivedReports] = useState<ArchivedReport[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  useEffect(() => {
    const t = user?.tenantId;
    if (!t) return;
    fetchArchivedReports(t).then(setArchivedReports).catch(() => {});
  }, [user?.tenantId]);

  const archivedByYear = useMemo(() => {
    const map = new Map<number, ArchivedReport[]>();
    archivedReports.forEach(r => {
      const list = map.get(r.year) ?? [];
      list.push(r);
      map.set(r.year, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b - a);
  }, [archivedReports]);

  const handleDownloadArchived = async (report: ArchivedReport) => {
    setDownloadingId(report.id);
    try {
      const url = await resolveStorageUrl(ARCHIVED_REPORTS_BUCKET, report.storagePath);
      if (!url) { toast.error('Não foi possível gerar o link de download'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloadingId(null);
    }
  };

  const generateReport = async () => {
    const t = user?.tenantId;
    if (!t) return;
    setLoading(true);
    setReportGenerated(false);
    setReceiptsDownloaded(false);
    try {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const [orders, shifts, alerts, costs] = await Promise.all([
        fetchOrdersInRange(t, start, end),
        fetchShiftsInRange(t, start, end),
        fetchSecurityAlertsInRange(t, start, end),
        fetchFixedCosts(t, { start, end: new Date(Math.min(end.getTime(), Date.now())) }),
      ]);
      setYearOrders(orders);
      setYearShifts(shifts);
      setAlertsCount(alerts.length);
      // recurringMonthly já vem "como estava no fim do período" — multiplicamos
      // pelos meses efetivamente cobertos para chegar ao total do ano/mês.
      setFixedCosts({ recurringMonthly: costs.recurringMonthly, oneTime: costs.oneTime });
      setReportGenerated(true);
      toast.success(`Relatório de ${year} gerado`);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const paid = yearOrders.filter(o => o.paid);
    if (month === null) return paid;
    return paid.filter(o => new Date(o.createdAt).getMonth() === month);
  }, [yearOrders, month]);

  const monthLabel = month !== null ? MONTHS_PT[month] : undefined;

  const expensesTotal = useMemo(() => {
    const months = monthsInSelection(year, month);
    return fixedCosts.recurringMonthly * months + fixedCosts.oneTime;
  }, [fixedCosts, year, month]);

  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((s, o) => s + o.total + (o.tip || 0), 0);
    const totalOrders = filteredOrders.length;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    let totalCost = 0;
    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        inventory.forEach(inv => {
          if (inv.linkedMenuItemIds.includes(item.menuItemId)) {
            totalCost += inv.costPerUnit * inv.usagePerServing * item.quantity;
          }
        });
      });
    });
    const ivaAmount = totalRevenue * (settings.ivaRate / 100);
    const profit = totalRevenue - totalCost - expensesTotal - ivaAmount;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    return { totalRevenue, totalOrders, avgTicket, totalCost, profit, margin };
  }, [filteredOrders, inventory, expensesTotal, settings.ivaRate]);

  const bestSellers = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        const cur = map.get(item.menuItemId) || { name: item.name, quantity: 0, revenue: 0 };
        map.set(item.menuItemId, { name: item.name, quantity: cur.quantity + item.quantity, revenue: cur.revenue + item.price * item.quantity });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  }, [filteredOrders]);

  // Uma linha por item vendido (não por pedido) — ordenada por data, o
  // mesmo nível de detalhe de um livro de vendas real. `receiptTag` replica
  // o formato já usado no recibo impresso do Caixa (POSPage), para dar para
  // cruzar uma linha do Excel com o recibo físico correspondente.
  const transactions = useMemo(() => {
    const orderTypeLabel = (o: Order) =>
      o.type === 'dine-in' ? `Mesa ${o.tableNumber ?? '—'}` : o.type === 'takeaway' ? 'Takeaway' : 'Entrega';
    const rows = filteredOrders.flatMap(o => {
      const date = new Date(o.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      const receiptTag = `#${o.id.slice(-4)}`;
      const orderType = orderTypeLabel(o);
      return o.items.map(item => ({
        date, receiptTag, orderType, description: item.name,
        quantity: item.quantity, value: item.price * item.quantity,
        _sortAt: o.createdAt,
      }));
    });
    return rows
      .sort((a, b) => a._sortAt.localeCompare(b._sortAt))
      .map(({ _sortAt: _drop, ...r }) => r);
  }, [filteredOrders]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        const menu = menuItems.find(m => m.id === item.menuItemId);
        const cat = menu?.category || 'Outros';
        map.set(cat, (map.get(cat) || 0) + item.price * item.quantity);
      });
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredOrders, menuItems]);

  const paymentData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
      const m = o.paymentMethod || 'cash';
      map.set(m, (map.get(m) || 0) + o.total + (o.tip || 0));
    });
    const labels: Record<string, string> = { cash: 'Dinheiro', card: 'Cartão', 'mobile-money': 'M-Pesa' };
    return Array.from(map.entries()).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [filteredOrders]);

  const revenueData = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number; profit: number }>();
    filteredOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const key = d.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' });
      const cur = map.get(key) || { revenue: 0, orders: 0, profit: 0 };
      const rev = o.total + (o.tip || 0);
      let cost = 0;
      o.items.forEach(item => {
        inventory.forEach(inv => {
          if (inv.linkedMenuItemIds.includes(item.menuItemId)) cost += inv.costPerUnit * inv.usagePerServing * item.quantity;
        });
      });
      map.set(key, { revenue: cur.revenue + rev, orders: cur.orders + 1, profit: cur.profit + (rev - cost) });
    });
    return Array.from(map.entries()).map(([label, v]) => ({ label, ...v }));
  }, [filteredOrders, inventory]);

  const shiftHoursSeconds = useMemo(() => {
    const relevant = month === null ? yearShifts : yearShifts.filter(s => new Date(s.clockIn).getMonth() === month);
    return relevant.reduce((sum, s) => {
      const start = new Date(s.clockIn).getTime();
      const end = s.clockOut ? new Date(s.clockOut).getTime() : Date.now();
      return sum + Math.max(0, (end - start) / 1000);
    }, 0);
  }, [yearShifts, month]);

  const buildPayload = (): YearReportPayload => ({
    year, monthLabel,
    stats,
    expenses: { recurringMonthly: fixedCosts.recurringMonthly, oneTime: fixedCosts.oneTime, total: expensesTotal },
    bestSellers, categoryData, paymentData, revenueData, transactions,
  });

  const handleExport = (kind: 'pdf' | 'csv' | 'excel') => {
    if (filteredOrders.length === 0) { toast.error('Sem dados para exportar no período selecionado'); return; }
    try {
      const payload = buildPayload();
      if (kind === 'pdf') exportYearReportPDF(payload);
      else if (kind === 'csv') exportYearReportCSV(payload);
      else exportYearReportExcel(payload);
      toast.success(`Relatório ${kind.toUpperCase()} exportado`);
    } catch (e) {
      console.error(e);
      toast.error('Falha ao exportar relatório');
    }
  };

  const handleDownloadReceipts = () => {
    if (filteredOrders.length === 0) { toast.info('Sem recibos no período'); return; }
    const rangeLabel = monthLabel ? `${monthLabel} ${year}` : String(year);
    downloadBatchReceiptsHTML(filteredOrders, {
      brand: settings.brandName, rangeLabel,
      logoUrl: settings.receiptShowLogo ? settings.receiptLogo : undefined,
    });
    setReceiptsDownloaded(true);
    toast.success('Recibos descarregados');
  };

  const handlePurge = async () => {
    const t = user?.tenantId;
    if (!t) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('purge-old-data', {
        body: { tenantId: t, cutoffDate: cutoffDate.toISOString() },
      });
      if (error) {
        toast.error('Não foi possível apagar os dados antigos; tente novamente');
        return;
      }
      const d = data as { ordersDeleted: number; shiftsDeleted: number; alertsDeleted: number };
      toast.success(`Apagados: ${d.ordersDeleted} pedidos, ${d.shiftsDeleted} turnos, ${d.alertsDeleted} alertas`);
      setConfirmText('');
      await Promise.all([fetchOrders(t), fetchShifts(t)]);
      refresh();
    } catch (e) {
      console.error(e);
      toast.error('Falha ao apagar dados antigos');
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = reportGenerated && receiptsDownloaded;

  return (
    <PageShell
      title="Arquivo de Dados"
      subtitle="Relatório anual, recibos e limpeza de dados com mais de um ano"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Archive className="w-4 h-4" /> Relatório anual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Ano</Label>
                <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                  <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mês</Label>
                <Select value={month === null ? 'all' : String(month)} onValueChange={v => setMonth(v === 'all' ? null : Number(v))}>
                  <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os meses</SelectItem>
                    {MONTHS_PT.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={generateReport} disabled={loading} className="h-9">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Gerar relatório
              </Button>
              {reportGenerated && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} className="gap-2">
                    <FileText className="w-4 h-4" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('excel')} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('csv')} className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadReceipts} className="gap-2">
                    <ScrollText className="w-4 h-4" /> Recibos do período (HTML)
                  </Button>
                </div>
              )}
            </div>

            {!reportGenerated ? (
              <p className="text-sm text-muted-foreground">
                Selecione o ano (e, opcionalmente, o mês) e clique em "Gerar relatório".
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Receita Total</p>
                    <p className="font-heading text-xl font-bold mt-1">{formatMT(stats.totalRevenue)}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Pedidos Pagos</p>
                    <p className="font-heading text-xl font-bold mt-1">{stats.totalOrders}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    <p className="font-heading text-xl font-bold mt-1">{formatMT(stats.avgTicket)}</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground">Lucro Líquido</p>
                    <p className="font-heading text-xl font-bold mt-1">{formatMT(stats.profit)}</p>
                    <p className="text-xs text-muted-foreground">{stats.margin.toFixed(1)}% margem</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2">Despesas e Salários</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Recorrentes</span><span>{formatMT(fixedCosts.recurringMonthly)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pontuais</span><span>{formatMT(fixedCosts.oneTime)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1"><span>Total</span><span>{formatMT(expensesTotal)}</span></div>
                    </div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1"><Award className="w-3 h-3" /> Mais Vendidos</p>
                    <div className="space-y-1 text-sm max-h-28 overflow-y-auto">
                      {bestSellers.slice(0, 5).map(b => (
                        <div key={b.name} className="flex justify-between"><span className="truncate">{b.name}</span><span className="text-muted-foreground shrink-0 ml-2">{b.quantity}x</span></div>
                      ))}
                      {bestSellers.length === 0 && <p className="text-muted-foreground">Sem dados</p>}
                    </div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1"><ClockIcon className="w-3 h-3" /> Equipa</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Horas trabalhadas</span><span>{formatHours(shiftHoursSeconds)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Alertas de segurança</span><span>{alertsCount ?? 0}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {archivedByYear.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageCheck className="w-4 h-4" /> Relatórios Arquivados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground -mt-1">
                Anos com mais de um ano são arquivados e apagados automaticamente — os Excel
                abaixo são a cópia guardada desses dados, mesmo depois de removidos do sistema.
              </p>
              {archivedByYear.map(([y, reports]) => {
                const yearRow = reports.find(r => r.month === 0);
                const monthRows = reports.filter(r => r.month > 0).sort((a, b) => a.month - b.month);
                return (
                  <div key={y} className="glass rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-heading font-bold">{y}</p>
                        {yearRow?.totalRevenue != null && (
                          <p className="text-xs text-muted-foreground">
                            {formatMT(yearRow.totalRevenue)} · {yearRow.totalOrders ?? 0} pedidos
                          </p>
                        )}
                      </div>
                      {yearRow && (
                        <Button
                          variant="outline" size="sm" className="gap-2"
                          disabled={downloadingId === yearRow.id}
                          onClick={() => handleDownloadArchived(yearRow)}
                        >
                          {downloadingId === yearRow.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          Excel do ano
                        </Button>
                      )}
                    </div>
                    {monthRows.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {monthRows.map(r => (
                          <Button
                            key={r.id} variant="secondary" size="sm" className="h-7 px-2.5 text-xs gap-1.5"
                            disabled={downloadingId === r.id}
                            onClick={() => handleDownloadArchived(r)}
                          >
                            {downloadingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            {MONTHS_PT[r.month - 1]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="w-4 h-4" /> Apagar dados antigos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Apaga permanentemente pedidos, turnos e alertas de segurança com mais de um ano
              (antes de <strong>{cutoffDate.toLocaleDateString('pt-PT')}</strong>) para libertar espaço de armazenamento.
              Despesas, salários e dados de clientes nunca são apagados. Esta ação não pode ser desfeita.
            </p>
            {!canDelete && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Gere o relatório e descarregue os recibos do período acima (idealmente {cutoffDate.getFullYear() - 1} ou
                  anterior) antes de poder apagar.
                </span>
              </div>
            )}
            <AlertDialog onOpenChange={(open) => { if (!open) setConfirmText(''); }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!canDelete} className="gap-2">
                  <Trash2 className="w-4 h-4" /> Apagar dados antigos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-destructive" /> Apagar dados com mais de um ano?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Vão ser apagados definitivamente todos os pedidos, turnos e alertas de segurança anteriores a{' '}
                    {cutoffDate.toLocaleDateString('pt-PT')}. Esta ação não pode ser desfeita. Escreva{' '}
                    <strong>{CONFIRM_WORD}</strong> para confirmar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  autoFocus
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={confirmText !== CONFIRM_WORD || deleting}
                    onClick={handlePurge}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Apagar definitivamente
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
