import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * `handleSubmit` em CustomerOrderPage usa uma ref síncrona (`submittingRef`)
 * além do estado `submitting`, precisamente porque dois cliques disparados
 * na MESMA tarefa do browser (duplo-toque num ecrã tátil, ou um duplo-clique
 * rápido) chegam ao handler antes do React sequer re-renderizar o botão como
 * `disabled` — ver comentário em CustomerOrderPage.tsx. Este teste dispara os
 * dois cliques dentro do MESMO `act()` para recriar exactamente essa janela;
 * sem a ref (confiando só em `disabled={submitting}`), os dois cliques
 * chamariam submitCustomerOrder duas vezes, descontando o estoque em dobro.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('CustomerOrderPage — trava de duplo-toque (submittingRef)', () => {
  const submitMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    submitMock.mockReset();

    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
        from: vi.fn(),
        rpc: vi.fn(),
        channel: vi.fn(),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn() },
      },
    }));

    vi.doMock('@/lib/customerOrder', () => ({
      fetchPublicMenu: vi.fn().mockResolvedValue([
        { id: 'item-1', name: 'Frango à Zambeziana', price: 350, category: 'Pratos', available: true },
      ]),
      fetchPublicBranding: vi.fn().mockResolvedValue(null),
      verifyLoyaltyCustomer: vi.fn(),
      submitCustomerOrder: submitMock,
    }));
  });

  it('dois cliques na mesma tarefa síncrona só disparam UMA chamada a submitCustomerOrder', async () => {
    // Nunca resolve durante o teste — imita uma rede lenta, que é precisamente
    // a janela onde um duplo-toque real consegue disparar duas vezes.
    submitMock.mockReturnValue(new Promise(() => {}));

    const { default: CustomerOrderPage } = await import('@/pages/CustomerOrderPage');
    render(
      <MemoryRouter initialEntries={['/pedir/tenant-1/mesa/table-1']}>
        <Routes>
          <Route path="/pedir/:tenantId/mesa/:tableId" element={<CustomerOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = await screen.findByRole('button', { name: /adicionar frango à zambeziana/i });
    await act(async () => { addBtn.click(); });

    const submitBtn = await screen.findByRole('button', { name: /fazer pedido/i });

    // Os dois cliques acontecem dentro do MESMO act() — nenhum re-render
    // (que desabilitaria o botão) chega a correr entre eles, tal como um
    // duplo-toque real na mesma tarefa do browser.
    await act(async () => {
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('depois da submissão falhar (orderId null), um novo clique volta a poder submeter', async () => {
    submitMock.mockResolvedValue(null);

    const { default: CustomerOrderPage } = await import('@/pages/CustomerOrderPage');
    render(
      <MemoryRouter initialEntries={['/pedir/tenant-1/mesa/table-1']}>
        <Routes>
          <Route path="/pedir/:tenantId/mesa/:tableId" element={<CustomerOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const addBtn = await screen.findByRole('button', { name: /adicionar frango à zambeziana/i });
    await act(async () => { addBtn.click(); });

    const submitBtn = await screen.findByRole('button', { name: /fazer pedido/i });
    await act(async () => { submitBtn.click(); });
    expect(submitMock).toHaveBeenCalledTimes(1);

    // A ref é libertada no `finally` — uma nova tentativa não deve ficar
    // presa mesmo depois de uma falha (orderId null).
    await act(async () => { submitBtn.click(); });
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});
