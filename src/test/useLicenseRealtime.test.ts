import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * T3.3: `useLicense` ouve `subscriptions` por Realtime — activar um plano
 * no SuperAdmin reflecte-se no dono quase de imediato, sem esperar o
 * próximo poll (30 min, só como rede de segurança).
 *
 * IMPORTANTE: useLicense() é chamado de vários sítios ao mesmo tempo na
 * mesma página (AppSidebar + RequireLicense + a própria página) — por isso
 * usa `subscribeLicense` (partilhado/com contagem de referências, ver
 * store.ts) em vez de abrir um `supabase.channel(...)` directo. A versão
 * inicial deste hook NÃO fazia isto e rebentava a app inteira em
 * praticamente todas as páginas ("cannot add postgres_changes callbacks
 * ... after subscribe()", apanhado pela suite Cypress) — este teste mocka
 * `subscribeLicense` (já testado à parte em store.test.ts) para confirmar
 * só a integração do lado do hook.
 */

const TENANT_ID = 'tenant-1';

function makeTenant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TENANT_ID, name: 'Teste', ownerEmail: 'a@b.com', licenseKey: 'lic', createdAt: '2026-01-01T00:00:00.000Z',
    subscription: { plan: 'monthly', status: 'active', history: [] },
    ...overrides,
  };
}

let currentTenant: ReturnType<typeof makeTenant> | null = makeTenant();
const refreshSubscriptionMock = vi.fn();
const fetchTenantMock = vi.fn();

vi.mock('@/lib/tenants', () => ({
  tenantStore: {
    current: () => currentTenant,
    daysUntilExpiry: () => 10,
  },
  refreshSubscription: (...a: unknown[]) => refreshSubscriptionMock(...a),
  fetchTenant: (...a: unknown[]) => fetchTenantMock(...a),
}));

const subscribeLicenseMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('@/lib/store', () => ({
  subscribeLicense: (...a: unknown[]) => subscribeLicenseMock(...a),
}));

import { useLicense } from '@/hooks/useLicense';

beforeEach(() => {
  localStorage.clear();
  currentTenant = makeTenant();
  refreshSubscriptionMock.mockReset().mockResolvedValue({ tenant: null });
  fetchTenantMock.mockReset().mockResolvedValue(null);
  subscribeLicenseMock.mockReset().mockReturnValue(unsubscribeMock);
  unsubscribeMock.mockReset();
});

describe('useLicense — Realtime via subscribeLicense (partilhado)', () => {
  it('subscreve com o tenant_id actual, nunca abrindo um canal Supabase directo', async () => {
    renderHook(() => useLicense());
    await waitFor(() => expect(subscribeLicenseMock).toHaveBeenCalledWith(TENANT_ID, expect.any(Function)));
  });

  it('um evento do canal partilhado dispara syncFromServer (refreshSubscription) sem esperar o polling', async () => {
    const activated = makeTenant({ subscription: { plan: 'annual', status: 'active', history: [] } });
    refreshSubscriptionMock.mockResolvedValue({ tenant: activated });

    const { result } = renderHook(() => useLicense());
    await waitFor(() => expect(subscribeLicenseMock).toHaveBeenCalled());
    refreshSubscriptionMock.mockClear();

    const onChange = subscribeLicenseMock.mock.calls[0][1] as () => void;
    onChange();

    await waitFor(() => expect(refreshSubscriptionMock).toHaveBeenCalledWith(TENANT_ID));
    await waitFor(() => expect(result.current.tenant?.subscription.plan).toBe('annual'));
  });

  it('chama a função de unsubscribe devolvida ao desmontar', async () => {
    const { unmount } = renderHook(() => useLicense());
    await waitFor(() => expect(subscribeLicenseMock).toHaveBeenCalled());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('sem tenant activo, não subscreve nada', async () => {
    currentTenant = null;
    renderHook(() => useLicense());
    await new Promise(r => setTimeout(r, 20));
    expect(subscribeLicenseMock).not.toHaveBeenCalled();
  });

  it('duas instâncias simultâneas (ex.: sidebar + página) chamam subscribeLicense duas vezes — nunca `new supabase.channel` directo, que é o que causava o crash', async () => {
    renderHook(() => useLicense());
    renderHook(() => useLicense());
    await waitFor(() => expect(subscribeLicenseMock).toHaveBeenCalledTimes(2));
    // Ambas as chamadas passam pelo MESMO ponto de entrada partilhado — a
    // deduplicação real (um só canal Supabase) é responsabilidade de
    // `subscribeLicense`, testada directamente em store.test.ts.
    expect(subscribeLicenseMock).toHaveBeenNthCalledWith(1, TENANT_ID, expect.any(Function));
    expect(subscribeLicenseMock).toHaveBeenNthCalledWith(2, TENANT_ID, expect.any(Function));
  });
});
