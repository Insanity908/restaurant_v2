import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportStats {
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  totalCost: number;
  profit: number;
  margin: number;
}

export interface ExportPayload {
  rangeLabel: string;
  previousLabel?: string;
  compareActive: boolean;
  stats: ExportStats;
  prevStats?: ExportStats;
  bestSellers: { name: string; quantity: number; revenue: number }[];
  categoryData: { name: string; value: number }[];
  paymentData: { name: string; value: number }[];
  revenueData: { label: string; revenue: number; profit: number; orders: number }[];
}

const fmtMT = (n: number) =>
  `${n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} MT`;

const pct = (cur: number, prev: number): string => {
  if (prev === 0) return cur === 0 ? '0%' : 'novo';
  const v = ((cur - prev) / Math.abs(prev)) * 100;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
};

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportsCSV(p: ExportPayload) {
  const lines: string[] = [];
  lines.push(`Relatório de Vendas`);
  lines.push(`Período,${csvEscape(p.rangeLabel)}`);
  if (p.compareActive && p.previousLabel) {
    lines.push(`Comparado com,${csvEscape(p.previousLabel)}`);
  }
  lines.push('');

  // KPIs
  lines.push('Indicadores');
  if (p.compareActive && p.prevStats) {
    lines.push('Métrica,Atual,Anterior,Variação');
    lines.push(`Receita Total,${fmtMT(p.stats.totalRevenue)},${fmtMT(p.prevStats.totalRevenue)},${pct(p.stats.totalRevenue, p.prevStats.totalRevenue)}`);
    lines.push(`Pedidos Pagos,${p.stats.totalOrders},${p.prevStats.totalOrders},${pct(p.stats.totalOrders, p.prevStats.totalOrders)}`);
    lines.push(`Ticket Médio,${fmtMT(p.stats.avgTicket)},${fmtMT(p.prevStats.avgTicket)},${pct(p.stats.avgTicket, p.prevStats.avgTicket)}`);
    lines.push(`Custo,${fmtMT(p.stats.totalCost)},${fmtMT(p.prevStats.totalCost)},${pct(p.stats.totalCost, p.prevStats.totalCost)}`);
    lines.push(`Lucro,${fmtMT(p.stats.profit)},${fmtMT(p.prevStats.profit)},${pct(p.stats.profit, p.prevStats.profit)}`);
    lines.push(`Margem (%),${p.stats.margin.toFixed(1)},${p.prevStats.margin.toFixed(1)},${(p.stats.margin - p.prevStats.margin).toFixed(1)} pp`);
  } else {
    lines.push('Métrica,Valor');
    lines.push(`Receita Total,${fmtMT(p.stats.totalRevenue)}`);
    lines.push(`Pedidos Pagos,${p.stats.totalOrders}`);
    lines.push(`Ticket Médio,${fmtMT(p.stats.avgTicket)}`);
    lines.push(`Custo,${fmtMT(p.stats.totalCost)}`);
    lines.push(`Lucro,${fmtMT(p.stats.profit)}`);
    lines.push(`Margem (%),${p.stats.margin.toFixed(1)}`);
  }
  lines.push('');

  lines.push('Mais Vendidos');
  lines.push('Item,Quantidade,Receita');
  p.bestSellers.forEach(b => lines.push(`${csvEscape(b.name)},${b.quantity},${fmtMT(b.revenue)}`));
  lines.push('');

  lines.push('Vendas por Categoria');
  lines.push('Categoria,Receita');
  p.categoryData.forEach(c => lines.push(`${csvEscape(c.name)},${fmtMT(c.value)}`));
  lines.push('');

  lines.push('Métodos de Pagamento');
  lines.push('Método,Total');
  p.paymentData.forEach(m => lines.push(`${csvEscape(m.name)},${fmtMT(m.value)}`));
  lines.push('');

  lines.push('Receita ao Longo do Tempo');
  lines.push('Período,Receita,Lucro,Pedidos');
  p.revenueData.forEach(r => lines.push(`${csvEscape(r.label)},${fmtMT(r.revenue)},${fmtMT(r.profit)},${r.orders}`));

  // BOM for Excel UTF-8
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `relatorio-${date}.csv`);
}

export function exportReportsPDF(p: ExportPayload) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Vendas', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Período: ${p.rangeLabel}`, pageWidth / 2, y, { align: 'center' });
  y += 5;
  if (p.compareActive && p.previousLabel) {
    doc.text(`Comparado com: ${p.previousLabel}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
  }
  doc.text(`Gerado em ${new Date().toLocaleString('pt-PT')}`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setTextColor(0);

  // KPIs
  const kpiHead =
    p.compareActive && p.prevStats
      ? [['Métrica', 'Atual', 'Anterior', 'Variação']]
      : [['Métrica', 'Valor']];
  const kpiBody =
    p.compareActive && p.prevStats
      ? [
          ['Receita Total', fmtMT(p.stats.totalRevenue), fmtMT(p.prevStats.totalRevenue), pct(p.stats.totalRevenue, p.prevStats.totalRevenue)],
          ['Pedidos Pagos', String(p.stats.totalOrders), String(p.prevStats.totalOrders), pct(p.stats.totalOrders, p.prevStats.totalOrders)],
          ['Ticket Médio', fmtMT(p.stats.avgTicket), fmtMT(p.prevStats.avgTicket), pct(p.stats.avgTicket, p.prevStats.avgTicket)],
          ['Custo', fmtMT(p.stats.totalCost), fmtMT(p.prevStats.totalCost), pct(p.stats.totalCost, p.prevStats.totalCost)],
          ['Lucro', fmtMT(p.stats.profit), fmtMT(p.prevStats.profit), pct(p.stats.profit, p.prevStats.profit)],
          ['Margem', `${p.stats.margin.toFixed(1)}%`, `${p.prevStats.margin.toFixed(1)}%`, `${(p.stats.margin - p.prevStats.margin).toFixed(1)} pp`],
        ]
      : [
          ['Receita Total', fmtMT(p.stats.totalRevenue)],
          ['Pedidos Pagos', String(p.stats.totalOrders)],
          ['Ticket Médio', fmtMT(p.stats.avgTicket)],
          ['Custo', fmtMT(p.stats.totalCost)],
          ['Lucro', fmtMT(p.stats.profit)],
          ['Margem', `${p.stats.margin.toFixed(1)}%`],
        ];

  autoTable(doc, {
    startY: y,
    head: kpiHead,
    body: kpiBody,
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  // Best sellers
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Mais Vendidos', 'Quantidade', 'Receita']],
    body: p.bestSellers.map(b => [b.name, String(b.quantity), fmtMT(b.revenue)]),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  // Categories
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Categoria', 'Receita']],
    body: p.categoryData.map(c => [c.name, fmtMT(c.value)]),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  // Payment methods
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Método de Pagamento', 'Total']],
    body: p.paymentData.map(m => [m.name, fmtMT(m.value)]),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  // Revenue over time
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [['Período', 'Receita', 'Lucro', 'Pedidos']],
    body: p.revenueData.map(r => [r.label, fmtMT(r.revenue), fmtMT(r.profit), String(r.orders)]),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    styles: { fontSize: 9 },
  });

  const date = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio-${date}.pdf`);
}
