import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, Order } from '@/types/restaurant';

const POINTS_PER_MT = 1 / 10;

export interface CustomerReportRow {
  name: string;
  phone: string;
  email?: string;
  orderCount: number;
  totalSpent: number;
  lastVisit?: string;
  points: number;
  tier: 'Bronze' | 'Prata' | 'Ouro';
}

export interface CustomerReportOptions {
  from?: string; // ISO date (inclusive)
  to?: string;   // ISO date (inclusive, end of day)
}

const fmtMT = (n: number) =>
  `${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MT`;

function inRange(iso: string | undefined, from?: Date, to?: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

export function buildCustomerReport(
  customers: Customer[],
  orders: Order[],
  opts: CustomerReportOptions = {},
): CustomerReportRow[] {
  const from = opts.from ? new Date(opts.from + 'T00:00:00') : undefined;
  const to = opts.to ? new Date(opts.to + 'T23:59:59') : undefined;

  return customers.map(c => {
    const norm = c.phone.replace(/\D/g, '');
    const matched = orders.filter(o => {
      if (!o.paid) return false;
      const link = o.customerId === c.id || (norm && o.customerPhone?.replace(/\D/g, '') === norm);
      if (!link) return false;
      const when = o.closedAt || o.updatedAt;
      return inRange(when, from, to);
    });
    const totalSpent = matched.reduce((s, o) => s + (o.total ?? 0), 0);
    const lastVisit = matched
      .map(o => o.closedAt || o.updatedAt)
      .sort()
      .reverse()[0];
    const earnedPoints = Math.floor(totalSpent * POINTS_PER_MT);
    const points = Math.max(0, earnedPoints + (c.pointsAdjustment || 0));
    const tier: CustomerReportRow['tier'] =
      points >= 200 ? 'Ouro' : points >= 50 ? 'Prata' : 'Bronze';
    return {
      name: c.name,
      phone: c.phone,
      email: c.email,
      orderCount: matched.length,
      totalSpent,
      lastVisit,
      points,
      tier,
    };
  });
}

function rangeLabel(opts: CustomerReportOptions): string {
  if (!opts.from && !opts.to) return 'Todo o período';
  if (opts.from && opts.to) return `${opts.from} → ${opts.to}`;
  return opts.from ? `Desde ${opts.from}` : `Até ${opts.to}`;
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportCustomersCSV(rows: CustomerReportRow[], opts: CustomerReportOptions = {}) {
  const lines: string[] = [];
  lines.push('Relatório de Clientes');
  lines.push(`Período,${csvEscape(rangeLabel(opts))}`);
  lines.push('');
  lines.push('Nome,Telefone,Email,Pedidos,Total Gasto,Última Visita,Pontos,Nível');
  rows.forEach(r => {
    lines.push([
      csvEscape(r.name),
      csvEscape(r.phone),
      csvEscape(r.email ?? ''),
      r.orderCount,
      fmtMT(r.totalSpent),
      r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('pt-PT') : '',
      r.points,
      r.tier,
    ].join(','));
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  download(blob, `clientes-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function exportCustomersPDF(rows: CustomerReportRow[], opts: CustomerReportOptions = {}) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Clientes', w / 2, 15, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text(`Período: ${rangeLabel(opts)}`, w / 2, 22, { align: 'center' });
  doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')}`, w / 2, 27, { align: 'center' });
  doc.setTextColor(0);

  const totalSpent = rows.reduce((s, r) => s + r.totalSpent, 0);
  const totalPoints = rows.reduce((s, r) => s + r.points, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orderCount, 0);

  autoTable(doc, {
    startY: 33,
    head: [['Métrica', 'Valor']],
    body: [
      ['Clientes', String(rows.length)],
      ['Pedidos no período', String(totalOrders)],
      ['Receita no período', fmtMT(totalSpent)],
      ['Pontos em circulação', String(totalPoints)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Nome', 'Telefone', 'Pedidos', 'Gasto', 'Última', 'Pontos', 'Nível']],
    body: rows.map(r => [
      r.name,
      r.phone,
      String(r.orderCount),
      fmtMT(r.totalSpent),
      r.lastVisit ? new Date(r.lastVisit).toLocaleDateString('pt-PT') : '—',
      String(r.points),
      r.tier,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 8 },
  });

  doc.save(`clientes-${new Date().toISOString().slice(0, 10)}.pdf`);
}
