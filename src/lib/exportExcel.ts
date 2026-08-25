import * as XLSX from 'xlsx';
import type { YearReportPayload } from './exportReports';

const fmtMT = (n: number) =>
  Number(n.toFixed(0));

/** Exporta o relatório anual como .xlsx com folhas separadas — mais útil
 *  para um arquivo anual do que uma única folha CSV (números nativos,
 *  separados por assunto). */
export function exportYearReportExcel(p: YearReportPayload): void {
  const wb = XLSX.utils.book_new();

  const periodLabel = p.monthLabel ? `${p.monthLabel} ${p.year}` : String(p.year);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Relatório Anual', periodLabel],
    [],
    ['Receita Total', fmtMT(p.stats.totalRevenue)],
    ['Pedidos Pagos', p.stats.totalOrders],
    ['Ticket Médio', fmtMT(p.stats.avgTicket)],
    ['Custo de Ingredientes', fmtMT(p.stats.totalCost)],
    ['Lucro Líquido', fmtMT(p.stats.profit)],
    ['Margem (%)', Number(p.stats.margin.toFixed(1))],
  ]), 'Resumo');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.revenueData.map(r => ({ Mês: r.label, Receita: fmtMT(r.revenue), Lucro: fmtMT(r.profit), Pedidos: r.orders })),
  ), 'Vendas Mensais');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.bestSellers.map(b => ({ Item: b.name, Quantidade: b.quantity, Receita: fmtMT(b.revenue) })),
  ), 'Mais Vendidos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.categoryData.map(c => ({ Categoria: c.name, Receita: fmtMT(c.value) })),
  ), 'Categorias');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.paymentData.map(m => ({ Método: m.name, Total: fmtMT(m.value) })),
  ), 'Pagamentos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Tipo', 'Valor'],
    ['Despesas Recorrentes', fmtMT(p.expenses.recurringMonthly)],
    ['Despesas Pontuais', fmtMT(p.expenses.oneTime)],
    ['Total', fmtMT(p.expenses.total)],
  ]), 'Despesas e Salários');

  // Uma linha por item vendido (não por pedido) — o mesmo nível de detalhe
  // de um livro de vendas. Os cabeçalhos são deliberadamente os mesmos que
  // uma futura importação (upload deste ficheiro para carregar histórico de
  // outro sistema) teria de reconhecer — não mudar sem atualizar essa
  // eventual leitura também.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.transactions.map(t => ({
      Data: t.date, Recibo: t.receiptTag, Tipo: t.orderType,
      Descrição: t.description, 'Qtd.': t.quantity, Valor: fmtMT(t.value),
    })),
  ), 'Transações');

  XLSX.writeFile(wb, `relatorio-anual-${p.year}${p.monthLabel ? `-${p.monthLabel}` : ''}.xlsx`);
}
