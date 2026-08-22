import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `nowIso()`/`syncServerClock()` guardam o offset num `let` de módulo (não
 * exportado, sem reset) — por isso cada teste re-importa o módulo do zero
 * (`vi.resetModules()` + `import()` dinâmico) em vez de confiar na ordem de
 * execução para começar sempre com offset 0.
 */

const rpcMock = vi.fn();

function withOffset(ms: number) {
  return { data: new Date(Date.now() + ms).toISOString(), error: null };
}

describe('serverClock', () => {
  beforeEach(() => {
    vi.resetModules();
    rpcMock.mockReset();
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: { rpc: rpcMock },
    }));
  });

  it('nowIso() sem nunca sincronizar equivale ao relógio local (offset 0)', async () => {
    const { nowIso } = await import('@/lib/serverClock');
    const before = Date.now();
    const t = new Date(nowIso()).getTime();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('aplica o offset medido do servidor a todas as chamadas seguintes de nowIso()', async () => {
    const AHEAD_MS = 10_000;
    rpcMock.mockResolvedValue(withOffset(AHEAD_MS));
    const { nowIso, syncServerClock } = await import('@/lib/serverClock');

    await syncServerClock();
    const t = new Date(nowIso()).getTime();

    expect(Math.abs(t - (Date.now() + AHEAD_MS))).toBeLessThan(2000);
  });

  it('erro do RPC deixa o offset em 0 — nunca lança e nunca aplica correcção', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { nowIso, syncServerClock } = await import('@/lib/serverClock');

    await expect(syncServerClock()).resolves.toBeUndefined();
    const t = new Date(nowIso()).getTime();
    expect(Math.abs(t - Date.now())).toBeLessThan(500);
  });

  it('data devolvida sem forma de data (NaN ao fazer parse) deixa o offset em 0', async () => {
    rpcMock.mockResolvedValue({ data: 'not-a-date', error: null });
    const { nowIso, syncServerClock } = await import('@/lib/serverClock');

    await syncServerClock();
    const t = new Date(nowIso()).getTime();
    expect(Math.abs(t - Date.now())).toBeLessThan(500);
  });

  it('data ausente (null, sem erro) deixa o offset em 0', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { nowIso, syncServerClock } = await import('@/lib/serverClock');

    await syncServerClock();
    const t = new Date(nowIso()).getTime();
    expect(Math.abs(t - Date.now())).toBeLessThan(500);
  });

  it('sincronizar duas vezes SUBSTITUI o offset em vez de o acumular', async () => {
    const { nowIso, syncServerClock } = await import('@/lib/serverClock');

    rpcMock.mockResolvedValueOnce(withOffset(5000));
    await syncServerClock();

    rpcMock.mockResolvedValueOnce(withOffset(1000));
    await syncServerClock();

    const t = new Date(nowIso()).getTime();
    // Se acumulasse, estaria perto de +6000ms; substituindo, fica perto de +1000ms.
    expect(t).toBeLessThan(Date.now() + 3000);
    expect(t).toBeGreaterThan(Date.now() - 1000);
  });
});
