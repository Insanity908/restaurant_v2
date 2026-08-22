import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * T2.8: depois de convidar (ou saltar) a equipa, o onboarding já não
 * termina de repente num Dashboard vazio — mostra um passo 3 com dois
 * atalhos ("Configurar cardápio"/"Configurar mesas") antes de seguir.
 */

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', name: 'Dono', email: 'dono@teste.mz', authUserId: 'auth1', role: 'admin', tenantId: 't1', tenantIds: ['t1'] },
    }),
  };
});

vi.mock('@/hooks/useLicense', () => ({
  useLicense: () => ({ tenant: { id: 't1', name: 'Restaurante Teste' } }),
}));

vi.mock('@/lib/tenants', () => ({
  tenantStore: {
    getAll: () => [{ id: 't1', name: 'Restaurante Teste', createdAt: '2026-01-01T00:00:00.000Z', subscription: { status: 'trial' } }],
    setCurrent: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/store', () => ({ staffStore: { add: vi.fn() } }));

async function renderOnboarding() {
  sessionStorage.setItem('onboarding_just_created', '1');
  const { default: OnboardingPage } = await import('@/pages/OnboardingPage');
  return render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
}

async function goToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /continuar/i }));
  await user.click(await screen.findByRole('button', { name: 'Saltar' }));
  await screen.findByText('Configurar cardápio');
}

describe('OnboardingPage — passo 3 (cardápio e mesas)', () => {
  beforeEach(() => {
    vi.resetModules();
    navigateMock.mockReset();
    sessionStorage.clear();
  });

  it('"Saltar" no passo 2 leva ao passo 3, não direto ao Dashboard', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await goToStep3(user);
    expect(navigateMock).not.toHaveBeenCalledWith('/', expect.anything());
    expect(screen.getByText('Configurar mesas')).toBeInTheDocument();
  });

  it('"Configurar cardápio" navega para /menu', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await goToStep3(user);
    await user.click(screen.getByText('Configurar cardápio'));
    expect(navigateMock).toHaveBeenCalledWith('/menu');
  });

  it('"Configurar mesas" navega para /tables', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await goToStep3(user);
    await user.click(screen.getByText('Configurar mesas'));
    expect(navigateMock).toHaveBeenCalledWith('/tables');
  });

  it('"Ir para o Dashboard" só aparece no fim, e navega para "/"', async () => {
    const user = userEvent.setup();
    await renderOnboarding();
    await goToStep3(user);
    await user.click(screen.getByRole('button', { name: /ir para o dashboard/i }));
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });
});
