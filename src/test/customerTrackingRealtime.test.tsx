import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * T2.9: CustomerTrackingPage (pública/anon) trocou o polling de 4s por
 * Realtime Broadcast Authorization (tópico "order:<uuid>", ver migration
 * 20260822160000) — não pode usar `postgres_changes` porque isso exigiria
 * dar a `anon` uma política de SELECT em `orders`, expondo a tabela toda.
 * Este teste cobre: nome do canal/config `private:true`, refetch ao
 * (re)conectar (SUBSCRIBED) e a cada evento broadcast, e limpeza do canal
 * ao desmontar.
 */

type BroadcastHandler = () => void;

let channelMock: {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};
let channelFnMock: ReturnType<typeof vi.fn>;
let removeChannelMock: ReturnType<typeof vi.fn>;
let broadcastHandlers: Record<string, BroadcastHandler>;
let subscribeStatusCb: ((status: string) => void) | undefined;

const getOrderStatusMock = vi.fn();

function makeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-1', type: 'dine-in', tableNumber: 3, status: 'active', total: 500,
    items: [{ name: 'Frango', quantity: 1, status: 'pending' }],
    ...overrides,
  };
}

vi.mock('@/lib/customerOrder', () => ({ getOrderStatus: (...args: unknown[]) => getOrderStatusMock(...args) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => channelFnMock(...args),
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  },
}));

async function renderTracking() {
  const { default: CustomerTrackingPage } = await import('@/pages/CustomerTrackingPage');
  return render(
    <MemoryRouter initialEntries={['/pedido/order-1']}>
      <Routes><Route path="/pedido/:orderId" element={<CustomerTrackingPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('CustomerTrackingPage — Realtime Broadcast em vez de polling', () => {
  beforeEach(() => {
    vi.resetModules();
    getOrderStatusMock.mockReset().mockResolvedValue(makeOrder());
    broadcastHandlers = {};
    subscribeStatusCb = undefined;
    channelMock = {
      on: vi.fn((_type: string, opts: { event: string }, cb: BroadcastHandler) => {
        broadcastHandlers[opts.event] = cb;
        return channelMock;
      }),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        subscribeStatusCb = cb;
        return channelMock;
      }),
    };
    channelFnMock = vi.fn(() => channelMock);
    removeChannelMock = vi.fn();
  });

  it('subscreve ao canal "order:<id>" com private:true, e regista INSERT/UPDATE/DELETE', async () => {
    await renderTracking();
    await waitFor(() => expect(channelFnMock).toHaveBeenCalledWith('order:order-1', { config: { private: true } }));
    const registeredEvents = channelMock.on.mock.calls.map(c => c[1].event);
    expect(registeredEvents.sort()).toEqual(['DELETE', 'INSERT', 'UPDATE']);
  });

  it('busca o estado ao conectar (SUBSCRIBED) — não só uma vez no mount', async () => {
    await renderTracking();
    await waitFor(() => expect(channelMock.subscribe).toHaveBeenCalled());
    getOrderStatusMock.mockClear();

    subscribeStatusCb?.('SUBSCRIBED');
    await waitFor(() => expect(getOrderStatusMock).toHaveBeenCalledWith('order-1'));
  });

  it('um broadcast UPDATE dispara nova leitura do estado (sem esperar 4s)', async () => {
    await renderTracking();
    await waitFor(() => expect(channelMock.subscribe).toHaveBeenCalled());
    getOrderStatusMock.mockClear();
    getOrderStatusMock.mockResolvedValue(makeOrder({ status: 'ready' }));

    broadcastHandlers['UPDATE']?.();

    await waitFor(() => expect(getOrderStatusMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Pronto')).toBeInTheDocument();
  });

  it('ao desmontar, remove o canal', async () => {
    const { unmount } = await renderTracking();
    await waitFor(() => expect(channelMock.subscribe).toHaveBeenCalled());
    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
