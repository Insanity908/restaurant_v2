import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { exportYearReportExcel } from '@/lib/exportExcel';
import type { YearReportPayload } from '@/lib/exportReports';

/**
 * Só `XLSX.writeFile` (o efeito colateral de gravar em disco) é mockado —
 * `XLSX.utils.*` corre a implementação real da biblioteca, por isso o
 * workbook capturado é o mesmo que seria realmente escrito, não uma
 * aproximação. Isto apanha erros reais de `json_to_sheet`/`aoa_to_sheet`
 * (ex.: array vazio a rebentar) que um mock total das utils esconderia.
 */
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: vi.fn() };
});

function basePayload(overrides: Partial<YearReportPayload> = {}): YearReportPayload {
  return {
    year: 2025,
    stats: {
      totalRevenue: 123456.7, totalOrders: 42, avgTicket: 2939.44,
      totalCost: 45000.3, profit: 78456.4, margin: 63.567,
    },
    expenses: { recurringMonthly: 3000, oneTime: 500, total: 3500 },
    bestSellers: [{ name: 'Frango Grelhado', quantity: 50, revenue: 17500 }],
    categoryData: [{ name: 'Pratos Principais', value: 60000 }],
    paymentData: [{ name: 'Dinheiro', value: 80000 }],
    revenueData: [{ label: 'Jan/25', revenue: 60000, profit: 40000, orders: 20 }],
    transactions: [
      { date: '03/05', receiptTag: '#a1b2', orderType: 'Mesa 4', description: 'Frango Grelhado', quantity: 2, value: 700 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(XLSX.writeFile).mockClear();
});

describe('exportYearReportExcel', () => {
  it('cria as 7 folhas na ordem certa', () => {
    exportYearReportExcel(basePayload());
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    expect(wb.SheetNames).toEqual([
      'Resumo', 'Vendas Mensais', 'Mais Vendidos', 'Categorias', 'Pagamentos', 'Despesas e Salários', 'Transações',
    ]);
  });

  it('folha "Transações": uma linha por item vendido, com recibo e tipo de pedido', () => {
    exportYearReportExcel(basePayload());
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Transações']);
    expect(rows).toEqual([
      { Data: '03/05', Recibo: '#a1b2', Tipo: 'Mesa 4', Descrição: 'Frango Grelhado', 'Qtd.': 2, Valor: 700 },
    ]);
  });

  it('folha "Transações" vazia não lança erro — fica só com o cabeçalho', () => {
    expect(() => exportYearReportExcel(basePayload({ transactions: [] }))).not.toThrow();
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Transações'])).toEqual([]);
  });

  it('folha "Resumo": valores arredondados ao inteiro, excepto a margem (1 casa decimal)', () => {
    exportYearReportExcel(basePayload());
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Resumo'], { header: 1 });

    const asMap = new Map(rows.filter(r => r.length === 2).map(r => [r[0], r[1]]));
    expect(asMap.get('Receita Total')).toBe(123457); // 123456.7 arredondado
    expect(asMap.get('Pedidos Pagos')).toBe(42);
    expect(asMap.get('Ticket Médio')).toBe(2939); // 2939.44 arredondado
    expect(asMap.get('Custo de Ingredientes')).toBe(45000); // 45000.3 arredondado
    expect(asMap.get('Lucro Líquido')).toBe(78456); // 78456.4 arredondado
    expect(asMap.get('Margem (%)')).toBe(63.6); // mantém 1 casa decimal
  });

  it('folha "Resumo": período mostra só o ano quando não há mês seleccionado', () => {
    exportYearReportExcel(basePayload({ year: 2024, monthLabel: undefined }));
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Resumo'], { header: 1 });
    expect(rows[0]).toEqual(['Relatório Anual', '2024']);
  });

  it('folha "Resumo": período mostra "Mês Ano" quando há mês seleccionado', () => {
    exportYearReportExcel(basePayload({ year: 2024, monthLabel: 'Março' }));
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Resumo'], { header: 1 });
    expect(rows[0]).toEqual(['Relatório Anual', 'Março 2024']);
  });

  it('folha "Vendas Mensais" reflecte revenueData linha a linha', () => {
    exportYearReportExcel(basePayload());
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Vendas Mensais']);
    expect(rows).toEqual([{ Mês: 'Jan/25', Receita: 60000, Lucro: 40000, Pedidos: 20 }]);
  });

  it('folha "Despesas e Salários" tem os 3 valores (recorrentes, pontuais, total)', () => {
    exportYearReportExcel(basePayload());
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Despesas e Salários'], { header: 1 });
    const asMap = new Map(rows.filter(r => r.length === 2).map(r => [r[0], r[1]]));
    expect(asMap.get('Despesas Recorrentes')).toBe(3000);
    expect(asMap.get('Despesas Pontuais')).toBe(500);
    expect(asMap.get('Total')).toBe(3500);
  });

  it('nome do ficheiro: só o ano quando não há mês seleccionado', () => {
    exportYearReportExcel(basePayload({ year: 2024, monthLabel: undefined }));
    const filename = vi.mocked(XLSX.writeFile).mock.calls[0][1];
    expect(filename).toBe('relatorio-anual-2024.xlsx');
  });

  it('nome do ficheiro: inclui o mês quando seleccionado', () => {
    exportYearReportExcel(basePayload({ year: 2024, monthLabel: 'Março' }));
    const filename = vi.mocked(XLSX.writeFile).mock.calls[0][1];
    expect(filename).toBe('relatorio-anual-2024-Março.xlsx');
  });

  it('bestSellers/categoryData/paymentData vazios não lançam erro — folhas ficam só com o cabeçalho', () => {
    expect(() => exportYearReportExcel(basePayload({ bestSellers: [], categoryData: [], paymentData: [] }))).not.toThrow();
    const wb = vi.mocked(XLSX.writeFile).mock.calls[0][0];
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Mais Vendidos'])).toEqual([]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Categorias'])).toEqual([]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets['Pagamentos'])).toEqual([]);
  });
});
