import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

/**
 * Importação de dados anteriores ao uso do sistema (menu, clientes,
 * inventário, histórico de vendas) via um ficheiro .xlsx com 4 folhas. Os
 * cabeçalhos da folha "Vendas" são deliberadamente os mesmos da folha
 * "Transações" que exportYearReportExcel já produz (ver comentário em
 * exportExcel.ts) — um relatório exportado deste sistema serve também como
 * ficheiro de importação, sem transformação nenhuma.
 */

const SHEETS = {
  menu: 'Cardápio',
  customers: 'Clientes',
  inventory: 'Inventário',
  sales: 'Vendas',
} as const;

export interface ImportMenuItem {
  name: string; price: number; category: string; description?: string; available: boolean;
}
export interface ImportCustomer {
  name: string; phone: string; email?: string; nuit?: string; birthday?: string; notes?: string; pointsAdjustment: number;
}
export interface ImportInventoryItem {
  name: string; unit: string; currentStock: number; minStock: number; costPerUnit: number;
}
export interface ImportSale {
  date: string; receipt?: string; type?: string; description: string; quantity: number; value: number;
}

export interface ParsedImportData {
  menuItems: ImportMenuItem[];
  customers: ImportCustomer[];
  inventory: ImportInventoryItem[];
  sales: ImportSale[];
}

export interface ImportRowError {
  sheet: string;
  row: number; // 1-based, contando o cabeçalho (linha 1) — bate certo com o que se vê no Excel
  message: string;
}

const MAX_ROWS_PER_SHEET = 20000;

export function downloadImportTemplate(): void {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Preço', 'Categoria', 'Descrição', 'Disponível'],
    ['Pizza Margarida', 450, 'Pratos Principais', 'Molho de tomate e queijo', 'Sim'],
  ]), SHEETS.menu);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Telefone', 'Email', 'NUIT', 'Aniversário', 'Notas', 'Pontos'],
    ['Maria João', '84 123 4567', '', '', '', '', 0],
  ]), SHEETS.customers);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Nome', 'Unidade', 'Stock Atual', 'Stock Mínimo', 'Custo por Unidade'],
    ['Farinha', 'kg', 20, 5, 80],
  ]), SHEETS.inventory);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Data', 'Recibo', 'Tipo', 'Descrição', 'Qtd.', 'Valor'],
    ['15/01/2026', '', 'Balcão', 'Pizza Margarida', 1, 450],
  ]), SHEETS.sales);

  XLSX.writeFile(wb, 'template-importacao-dados-antigos.xlsx');
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows.slice(0, MAX_ROWS_PER_SHEET);
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (v === '' || v === undefined || v === null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown, fallback = true): boolean => {
  const s = str(v).toLowerCase();
  if (!s) return fallback;
  return ['sim', 'true', '1', 'verdadeiro', 'disponível', 'disponivel'].includes(s);
};
/** Datas do Excel chegam como Date (com cellDates:true) ou já como texto —
 *  guarda sempre como ISO para o edge function não ter de adivinhar formato. */
const dateStr = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString();
  const s = str(v);
  if (!s) return '';
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : parsed.toISOString();
};

export async function parseImportFile(file: File): Promise<{ data: ParsedImportData; errors: ImportRowError[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const errors: ImportRowError[] = [];
  const menuItems: ImportMenuItem[] = [];
  sheetRows(wb, SHEETS.menu).forEach((r, i) => {
    const row = i + 2;
    const name = str(r['Nome']);
    if (!name) return; // linha em branco — ignora silenciosamente
    const price = num(r['Preço']);
    if (price === null || price < 0) { errors.push({ sheet: SHEETS.menu, row, message: `Preço inválido para "${name}"` }); return; }
    menuItems.push({
      name, price, category: str(r['Categoria']) || 'Geral',
      description: str(r['Descrição']) || undefined, available: bool(r['Disponível']),
    });
  });

  const customers: ImportCustomer[] = [];
  sheetRows(wb, SHEETS.customers).forEach((r, i) => {
    const row = i + 2;
    const name = str(r['Nome']);
    if (!name) return;
    customers.push({
      name, phone: str(r['Telefone']), email: str(r['Email']) || undefined,
      nuit: str(r['NUIT']) || undefined, birthday: str(r['Aniversário']) || undefined,
      notes: str(r['Notas']) || undefined, pointsAdjustment: num(r['Pontos']) ?? 0,
    });
  });

  const inventory: ImportInventoryItem[] = [];
  sheetRows(wb, SHEETS.inventory).forEach((r, i) => {
    const row = i + 2;
    const name = str(r['Nome']);
    if (!name) return;
    const currentStock = num(r['Stock Atual']);
    if (currentStock === null) { errors.push({ sheet: SHEETS.inventory, row, message: `Stock Atual inválido para "${name}"` }); return; }
    inventory.push({
      name, unit: str(r['Unidade']) || 'un', currentStock,
      minStock: num(r['Stock Mínimo']) ?? 0, costPerUnit: num(r['Custo por Unidade']) ?? 0,
    });
  });

  const sales: ImportSale[] = [];
  sheetRows(wb, SHEETS.sales).forEach((r, i) => {
    const row = i + 2;
    const description = str(r['Descrição']);
    const date = dateStr(r['Data']);
    if (!description && !date) return; // linha em branco
    if (!date) { errors.push({ sheet: SHEETS.sales, row, message: 'Data em falta' }); return; }
    if (!description) { errors.push({ sheet: SHEETS.sales, row, message: 'Descrição em falta' }); return; }
    const value = num(r['Valor']);
    if (value === null || value < 0) { errors.push({ sheet: SHEETS.sales, row, message: `Valor inválido para "${description}"` }); return; }
    sales.push({
      date, receipt: str(r['Recibo']) || undefined, type: str(r['Tipo']) || undefined,
      description, quantity: num(r['Qtd.']) ?? 1, value,
    });
  });

  return { data: { menuItems, customers, inventory, sales }, errors };
}

export interface ImportResult {
  ok: boolean;
  imported?: Record<string, number>;
  serverErrors?: string[];
  error?: string;
}

export async function runHistoricalImport(tenantId: string, data: ParsedImportData): Promise<ImportResult> {
  const { data: res, error } = await supabase.functions.invoke('import-historical-data', {
    body: { tenantId, data },
  });
  if (error) return { ok: false, error: error.message };
  const result = res as { ok?: boolean; imported?: Record<string, number>; errors?: string[]; error?: string };
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Falha na importação' };
  return { ok: true, imported: result.imported, serverErrors: result.errors };
}
