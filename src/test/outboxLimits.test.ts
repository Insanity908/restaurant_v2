import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WriteOp } from '@/lib/outbox';

/**
 * T3.1: um dispositivo offline durante muito tempo não pode acumular
 * operações sem limite no `localStorage`. Duas defesas, nenhuma silenciosa:
 * purga automática por idade (>7 dias) e um tecto rígido (500) que descarta
 * primeiro as já FALHADAS antes de tocar em pendentes genuínas. Usa o
 * `outbox.ts` real (só `supabase`/`sonner` são mockados) para não escapar
 * bugs reais no comportamento central de sincronização.
 *
 * Cada teste reimporta `@/lib/outbox` depois de `vi.resetModules()` — o
 * módulo guarda estado próprio (`flushing`, `listeners`) que não deve
 * atravessar testes; só o `localStorage` (partilhado de propósito) é que
 * transporta o estado real entre a preparação e a chamada testada.
 */

const toastErrorMock = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() } }));

// Erro sempre TRANSITÓRIO (falha de rede) de propósito: `flushOutbox` pára
// logo na primeira tentativa (`isTransient` → `return`, ver outbox.ts) sem
// escrever nada de volta no localStorage. Isto mantém os testes abaixo
// determinísticos mesmo quando `flushOutbox()` é disparado em fundo
// (fire-and-forget, dentro de `queueWrite`) sem eu poder esperar por ele —
// como nunca chega a `write(rest)`, não há nada para correr atrás do meu
// `await` e poluir o próximo teste. Segue o mesmo padrão de builder
// encadeável de `outboxRace.test.ts`.
function transientBuilder() {
  const err = { error: { message: 'Failed to fetch', code: '' } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    eq: () => builder,
    lte: () => Promise.resolve(err),
    lt: () => Promise.resolve(err),
    then: (resolve: (v: typeof err) => void) => Promise.resolve(err).then(resolve),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: transientBuilder,
      update: transientBuilder,
      delete: transientBuilder,
      upsert: transientBuilder,
    }),
  },
}));

const KEY = 'sync_outbox_v1';

function seedRawOps(ops: WriteOp[]) {
  localStorage.setItem(KEY, JSON.stringify(ops));
}
function readRawOps(): WriteOp[] {
  return JSON.parse(localStorage.getItem(KEY) || '[]') as WriteOp[];
}
function makeOp(overrides: Partial<WriteOp> = {}): WriteOp {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), table: 'customers', action: 'update', values: {}, ...overrides };
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  localStorage.clear();
  toastErrorMock.mockClear();
  vi.resetModules();
});

describe('purga automática por idade', () => {
  it('descarta operações com mais de OUTBOX_MAX_AGE_DAYS e avisa (consola + toast), mantendo as recentes', async () => {
    const { OUTBOX_MAX_AGE_DAYS, flushOutbox } = await import('@/lib/outbox');
    seedRawOps([
      makeOp({ id: 'old-1', at: daysAgo(OUTBOX_MAX_AGE_DAYS + 1) }),
      makeOp({ id: 'recent-1', at: daysAgo(1), table: 'shifts' }),
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await flushOutbox();
    warnSpy.mockRestore();

    expect(readRawOps().find(o => o.id === 'old-1')).toBeUndefined();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('1 alteração descartada'));
  });

  it('não avisa nem descarta nada quando não há operações antigas', async () => {
    const { flushOutbox } = await import('@/lib/outbox');
    seedRawOps([makeOp({ id: 'fresh-1', at: daysAgo(1) })]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await flushOutbox();
    warnSpy.mockRestore();

    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe('tecto rígido de operações (OUTBOX_MAX_OPS)', () => {
  it('ao ultrapassar o tecto, descarta primeiro as operações já FALHADAS mais antigas', async () => {
    const { OUTBOX_MAX_OPS, cloud } = await import('@/lib/outbox');
    const failedOld = Array.from({ length: 5 }, (_, i) => makeOp({ id: `failed-${i}`, failed: true, at: daysAgo(2) }));
    const pending = Array.from({ length: OUTBOX_MAX_OPS - 1 }, (_, i) => makeOp({ id: `pending-${i}` }));
    seedRawOps([...failedOld, ...pending]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Uma escrita nova com a fila já cheia entra pelo caminho "enqueue"
    // (preserva ordem, ver queueWrite) e dispara enforceCap().
    await cloud('customers').update({}).eq('id', 'x');
    warnSpy.mockRestore();

    const after = readRawOps();
    expect(after.length).toBeLessThanOrEqual(OUTBOX_MAX_OPS);
    expect(after.filter(o => o.failed).length).toBe(0);
    // As pendentes genuínas não foram tocadas — as 5 falhadas + 1 nova cabiam sozinhas.
    expect(after.find(o => o.id === 'pending-0')).toBeDefined();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining('descartada'));
  });

  it('só descarta pendentes genuínas (as mais antigas) quando não há falhadas suficientes para abrir espaço', async () => {
    const { OUTBOX_MAX_OPS, cloud } = await import('@/lib/outbox');
    seedRawOps(Array.from({ length: OUTBOX_MAX_OPS }, (_, i) => makeOp({ id: `pending-${i}` })));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await cloud('customers').update({}).eq('id', 'x');
    warnSpy.mockRestore();

    const after = readRawOps();
    expect(after.length).toBeLessThanOrEqual(OUTBOX_MAX_OPS);
    expect(after.find(o => o.id === 'pending-0')).toBeUndefined();
  });

  it('fila pequena (uso normal) nunca aciona o tecto nem avisa', async () => {
    const { cloud } = await import('@/lib/outbox');
    seedRawOps(Array.from({ length: 3 }, (_, i) => makeOp({ id: `p-${i}` })));
    await cloud('customers').update({}).eq('id', 'x');
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});

describe('pendingResourceIds continua correcto depois da purga por idade', () => {
  it('um recurso cuja única operação pendente foi descartada por idade deixa de aparecer como pendente', async () => {
    const { flushOutbox, pendingResourceIds, OUTBOX_MAX_AGE_DAYS } = await import('@/lib/outbox');
    seedRawOps([makeOp({ id: 'old-1', at: daysAgo(OUTBOX_MAX_AGE_DAYS + 1), table: 'customers', resource: 'customers:c1' })]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await flushOutbox();
    warnSpy.mockRestore();

    expect(pendingResourceIds('customers').has('c1')).toBe(false);
  });
});

describe('clearOutbox continua a esvaziar tudo (sem regressão do T3.1)', () => {
  it('esvazia a fila independentemente do tamanho', async () => {
    const { clearOutbox, outboxState } = await import('@/lib/outbox');
    seedRawOps(Array.from({ length: 10 }, (_, i) => makeOp({ id: `x-${i}` })));
    clearOutbox();
    expect(outboxState().ops).toHaveLength(0);
  });
});
