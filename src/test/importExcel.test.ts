import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseImportFile, buildBackupWorkbook, type ParsedImportData } from '@/lib/importExcel';

function workbookToFile(wb: XLSX.WorkBook): File {
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const file = new File([buf], 'backup.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buf });
  }
  return file;
}

function bookToFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  });
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const file = new File([buf], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  // jsdom's File/Blob não implementa arrayBuffer() — parseImportFile só
  // precisa desse método, por isso supre-o directamente a partir do buffer
  // que já temos, em vez de depender do polyfill do ambiente de teste.
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buf });
  }
  return file;
}

describe('parseImportFile', () => {
  it('lê as 4 folhas do template e converte para os tipos certos', async () => {
    const file = bookToFile({
      'Cardápio': [
        ['Nome', 'Preço', 'Categoria', 'Descrição', 'Disponível'],
        ['Pizza Margarida', 450, 'Pratos Principais', 'Molho de tomate', 'Sim'],
        ['Sumo', 120, 'Bebidas', '', 'Não'],
      ],
      'Clientes': [
        ['Nome', 'Telefone', 'Email', 'NUIT', 'Aniversário', 'Notas', 'Pontos'],
        ['Maria João', '84 123 4567', '', '', '', '', 10],
      ],
      'Inventário': [
        ['Nome', 'Unidade', 'Stock Atual', 'Stock Mínimo', 'Custo por Unidade'],
        ['Farinha', 'kg', 20, 5, 80],
      ],
      'Vendas': [
        ['Data', 'Recibo', 'Tipo', 'Descrição', 'Qtd.', 'Valor'],
        ['15/01/2026', '', 'Balcão', 'Pizza Margarida', 1, 450],
      ],
    });

    const { data, errors } = await parseImportFile(file);

    expect(errors).toHaveLength(0);
    expect(data.menuItems).toEqual([
      { name: 'Pizza Margarida', price: 450, category: 'Pratos Principais', description: 'Molho de tomate', available: true },
      { name: 'Sumo', price: 120, category: 'Bebidas', description: undefined, available: false },
    ]);
    expect(data.customers).toEqual([
      { name: 'Maria João', phone: '84 123 4567', email: undefined, nuit: undefined, birthday: undefined, notes: undefined, pointsAdjustment: 10 },
    ]);
    expect(data.inventory).toEqual([
      { name: 'Farinha', unit: 'kg', currentStock: 20, minStock: 5, costPerUnit: 80 },
    ]);
    expect(data.sales).toHaveLength(1);
    expect(data.sales[0]).toMatchObject({ receipt: undefined, type: 'Balcão', description: 'Pizza Margarida', quantity: 1, value: 450 });
  });

  it('ignora linhas em branco e reporta erros por linha sem travar as restantes', async () => {
    const file = bookToFile({
      'Cardápio': [
        ['Nome', 'Preço', 'Categoria', 'Descrição', 'Disponível'],
        ['Item Bom', 100, 'Geral', '', 'Sim'],
        ['', '', '', '', ''], // linha em branco
        ['Item Sem Preço', '', 'Geral', '', 'Sim'],
      ],
      'Clientes': [['Nome', 'Telefone', 'Email', 'NUIT', 'Aniversário', 'Notas', 'Pontos']],
      'Inventário': [['Nome', 'Unidade', 'Stock Atual', 'Stock Mínimo', 'Custo por Unidade']],
      'Vendas': [['Data', 'Recibo', 'Tipo', 'Descrição', 'Qtd.', 'Valor']],
    });

    const { data, errors } = await parseImportFile(file);

    expect(data.menuItems).toEqual([
      { name: 'Item Bom', price: 100, category: 'Geral', description: undefined, available: true },
    ]);
    expect(errors).toEqual([
      { sheet: 'Cardápio', row: 4, message: 'Preço inválido para "Item Sem Preço"' },
    ]);
  });

  it('agrupamento de vendas: linhas com o mesmo Recibo continuam distintas dos sem recibo', async () => {
    const file = bookToFile({
      'Cardápio': [['Nome', 'Preço', 'Categoria', 'Descrição', 'Disponível']],
      'Clientes': [['Nome', 'Telefone', 'Email', 'NUIT', 'Aniversário', 'Notas', 'Pontos']],
      'Inventário': [['Nome', 'Unidade', 'Stock Atual', 'Stock Mínimo', 'Custo por Unidade']],
      'Vendas': [
        ['Data', 'Recibo', 'Tipo', 'Descrição', 'Qtd.', 'Valor'],
        ['15/01/2026', '#a1', 'Mesa', 'Pizza', 1, 450],
        ['15/01/2026', '#a1', 'Mesa', 'Sumo', 2, 240],
        ['15/01/2026', '', 'Balcão', 'Café', 1, 60],
      ],
    });

    const { data } = await parseImportFile(file);
    expect(data.sales).toHaveLength(3);
    expect(data.sales.filter(s => s.receipt === '#a1')).toHaveLength(2);
  });

  it('buildBackupWorkbook (Arquivo de Dados) produz um ficheiro que parseImportFile lê de volta sem perdas — mesmo layout nos dois sentidos', async () => {
    const original: ParsedImportData = {
      menuItems: [{ name: 'Pizza Margarida', price: 450, category: 'Pratos Principais', description: 'Molho de tomate', available: true }],
      customers: [{ name: 'Maria João', phone: '84 123 4567', email: undefined, nuit: undefined, birthday: undefined, notes: undefined, pointsAdjustment: 10 }],
      inventory: [{ name: 'Farinha', unit: 'kg', currentStock: 20, minStock: 5, costPerUnit: 80 }],
      sales: [{ date: '15/01/2026', receipt: '#a1b2', type: 'Mesa 4', description: 'Frango Grelhado', quantity: 2, value: 700 }],
    };

    const wb = buildBackupWorkbook(original);
    const { data, errors } = await parseImportFile(workbookToFile(wb));

    expect(errors).toHaveLength(0);
    expect(data.menuItems).toEqual(original.menuItems);
    expect(data.customers).toEqual(original.customers);
    expect(data.inventory).toEqual(original.inventory);
    expect(data.sales).toHaveLength(1);
    expect(data.sales[0]).toMatchObject({
      receipt: '#a1b2', type: 'Mesa 4', description: 'Frango Grelhado', quantity: 2, value: 700,
    });
  });
});
