import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';

/**
 * Regressão: no mount, `onAuthStateChange` dispara um evento INITIAL_SESSION
 * e a chamada explícita a `getSession()` resolve quase em simultâneo, para a
 * MESMA sessão — ambas chamam hydrate(). Sem uma trava, as duas viam
 * tenantIds vazio, liam o mesmo `pending_onboarding` do localStorage e
 * invocavam bootstrap-tenant em paralelo, criando um restaurante duplicado
 * cada uma (visto no Super Admin: várias contas "Teste" para o mesmo dono).
 * Este teste simula exactamente essa dupla-chamada e verifica que
 * bootstrap-tenant só é invocado uma vez.
 */

const { invokeMock, session, delay } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  session: { user: { id: 'user-1', email: 'teste@x.com' } } as any,
  // Latência artificial: sem isto, as queries mockadas resolvem tão depressa
  // que a 1ª hydrate() (a de getSession(), que corre em microtask) acaba
  // completamente ANTES de a 2ª (a de onAuthStateChange, atrasada por um
  // setTimeout(0) real no componente) sequer começar — o que mascararia a
  // corrida mesmo sem a trava. Uns milissegundos aqui reproduzem a janela
  // real (round-trips de rede) onde as duas se sobrepõem.
  delay: <T,>(v: T) => new Promise<T>(resolve => setTimeout(() => resolve(v), 5)),
}));
invokeMock.mockImplementation(() => delay({ data: { ok: true, tenantId: 'tenant-x' }, error: null }));

function makeQuery(table: string) {
  const rows: Record<string, unknown> =
    table === 'profiles' ? { name: 'Teste', email: 'teste@x.com', phone: null, username: null } : [];
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    maybeSingle: () => delay({ data: rows, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => void) => { delay({ data: rows, error: null }).then(resolve); },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        // Dispara já a seguir ao registo, tal como o cliente real faz com
        // INITIAL_SESSION — ao mesmo tempo que getSession() (abaixo) também
        // resolve para a mesma sessão.
        Promise.resolve().then(() => cb('INITIAL_SESSION', session));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => delay({ data: { session } }),
    },
    from: (table: string) => makeQuery(table),
    functions: { invoke: invokeMock },
  },
}));

vi.mock('@/lib/settings', () => ({ fetchSettings: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/loyaltySettings', () => ({ fetchLoyaltySettings: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  return { ...actual, fetchStaffPermissions: vi.fn().mockResolvedValue({}) };
});
vi.mock('@/lib/paymentAccounts', () => ({ fetchPaymentAccounts: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/billing', () => ({ fetchPlans: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/store', () => ({ fetchTenantCatalog: vi.fn().mockResolvedValue({}) }));

function Probe() {
  const { loading } = useAuth();
  return <div>{loading ? 'a carregar' : 'pronto'}</div>;
}

describe('AuthContext — corrida no bootstrap de restaurante pendente', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    localStorage.clear();
    localStorage.setItem('pending_onboarding', JSON.stringify({ restaurantName: 'Teste', ownerName: 'Teste' }));
  });

  it('duas chamadas quase simultâneas a hydrate() só invocam bootstrap-tenant uma vez', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    await screen.findByText('pronto', {}, { timeout: 2000 });
    await waitFor(() => expect(invokeMock).toHaveBeenCalled(), { timeout: 2000 });
    // Dá tempo a uma eventual segunda hydrate() correr também.
    await new Promise(r => setTimeout(r, 100));

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('bootstrap-tenant', { body: { restaurantName: 'Teste', ownerName: 'Teste' } });
  });
});
