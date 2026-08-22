import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportShiftsCSV } from '@/lib/exportReports';

/**
 * T2.5: exportação de Turnos em CSV. Só o efeito colateral de download
 * (`URL.createObjectURL`/clique num `<a>`) é mockado — o conteúdo do CSV é
 * lido de volta do `Blob` real passado a `createObjectURL`, por isso o
 * teste apanha erros reais de formatação, não uma aproximação do que o
 * código "deveria" produzir.
 */

let capturedBlob: Blob | null = null;

// jsdom's Blob polyfill has no `.text()`, and Node's global `Response` doesn't
// recognise a jsdom Blob as a valid body (reads it as "[object Blob]") — but
// jsdom's FileReader does support reading it correctly.
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  capturedBlob = null;
  // jsdom não implementa URL.createObjectURL/revokeObjectURL — atribuição
  // directa em vez de spyOn (que exige que a propriedade já exista).
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    capturedBlob = b as Blob;
    return 'blob:mock';
  });
  URL.revokeObjectURL = vi.fn();
});

describe('exportShiftsCSV', () => {
  it('inclui cabeçalho e uma linha por turno, com "Em curso" quando não há saída', async () => {
    exportShiftsCSV([
      { date: '20/08/2026', staffName: 'Ana', staffRole: 'waiter', clockIn: '08:00', clockOut: '16:00', durationLabel: '8h 00m' },
      { date: '21/08/2026', staffName: 'Bruno', staffRole: 'kitchen', clockIn: '09:00', durationLabel: '3h 15m' },
    ]);
    expect(capturedBlob).not.toBeNull();
    const text = await readBlobText(capturedBlob!);
    const lines = text.replace(/^﻿/, '').split('\n');
    expect(lines[0]).toBe('Histórico de Turnos');
    expect(lines[1]).toBe('Data,Funcionário,Cargo,Entrada,Saída,Duração');
    expect(lines[2]).toBe('20/08/2026,Ana,waiter,08:00,16:00,8h 00m');
    expect(lines[3]).toBe('21/08/2026,Bruno,kitchen,09:00,Em curso,3h 15m');
  });

  it('escapa nomes com vírgula', async () => {
    exportShiftsCSV([
      { date: '20/08/2026', staffName: 'Ana, a Chefe', staffRole: 'manager', clockIn: '08:00', clockOut: '16:00', durationLabel: '8h 00m' },
    ]);
    const text = await readBlobText(capturedBlob!);
    expect(text).toContain('"Ana, a Chefe"');
  });

  it('lista vazia não lança erro — só o cabeçalho', async () => {
    expect(() => exportShiftsCSV([])).not.toThrow();
    const text = await readBlobText(capturedBlob!);
    const lines = text.replace(/^﻿/, '').split('\n');
    expect(lines).toEqual(['Histórico de Turnos', 'Data,Funcionário,Cargo,Entrada,Saída,Duração']);
  });
});
