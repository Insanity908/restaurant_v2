import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '@/context/AuthContext';

/**
 * `requestPasswordReset`/`updatePassword` são finos wrappers sobre
 * `supabase.auth.resetPasswordForEmail`/`updateUser` — o valor deles está em
 * garantir os argumentos certos (redirectTo, mapear erro -> {ok:false}) e
 * não em lógica própria, por isso testados directamente pela API do
 * contexto em vez de montar as páginas inteiras.
 */

const { resetMock, updateUserMock, session } = vi.hoisted(() => ({
  resetMock: vi.fn(),
  updateUserMock: vi.fn(),
  session: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        Promise.resolve().then(() => cb('INITIAL_SESSION', session));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session } }),
      resetPasswordForEmail: resetMock,
      updateUser: updateUserMock,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    functions: { invoke: vi.fn() },
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
  const { requestPasswordReset, updatePassword } = useAuth();
  return (
    <div>
      <button onClick={() => void requestPasswordReset('dono@teste.mz').then(r => {
        document.title = r.ok ? 'reset-ok' : `reset-erro:${r.error}`;
      })}>pedir reset</button>
      <button onClick={() => void updatePassword('nova-password-123').then(r => {
        document.title = r.ok ? 'update-ok' : `update-erro:${r.error}`;
      })}>actualizar password</button>
    </div>
  );
}

describe('AuthContext — recuperação de password', () => {
  beforeEach(() => {
    resetMock.mockReset();
    updateUserMock.mockReset();
    document.title = '';
  });

  it('requestPasswordReset chama resetPasswordForEmail com redirectTo para /reset-password', async () => {
    resetMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await user.click(await screen.findByText('pedir reset'));

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith(
      'dono@teste.mz',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    ));
    await waitFor(() => expect(document.title).toBe('reset-ok'));
  });

  it('requestPasswordReset devolve {ok:false, error} quando o Supabase falha', async () => {
    resetMock.mockResolvedValue({ error: { message: 'rate limit' } });
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await user.click(await screen.findByText('pedir reset'));

    await waitFor(() => expect(document.title).toBe('reset-erro:rate limit'));
  });

  it('updatePassword chama supabase.auth.updateUser com a nova password', async () => {
    updateUserMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await user.click(await screen.findByText('actualizar password'));

    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'nova-password-123' }));
    await waitFor(() => expect(document.title).toBe('update-ok'));
  });

  it('updatePassword devolve {ok:false, error} sem sessão de recuperação válida', async () => {
    updateUserMock.mockResolvedValue({ error: { message: 'Auth session missing' } });
    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);

    await user.click(await screen.findByText('actualizar password'));

    await waitFor(() => expect(document.title).toBe('update-erro:Auth session missing'));
  });
});
