import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * T3.2: badge em tempo real na sidebar do superadmin, somando
 * comprovativos de pagamento pendentes + feedback por ler. Só deve
 * activar (query + subscrição Realtime) quando o utilizador actual É
 * superadmin — o resto da equipa não deve pagar este custo.
 */

let mockRole: string | undefined = 'superadmin';
const fetchPendingSubmissionsMock = vi.fn();
const fetchFeedbackMock = vi.fn();
let broadcastHandlers: (() => void)[] = [];
const channelMock = {
  on: vi.fn((_type: string, _opts: unknown, cb: () => void) => { broadcastHandlers.push(cb); return channelMock; }),
  subscribe: vi.fn(() => channelMock),
};
const removeChannelMock = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useOptionalAuth: () => (mockRole ? { user: { role: mockRole } } : null),
}));

vi.mock('@/lib/paymentSubmissions', () => ({ fetchPendingSubmissions: (...a: unknown[]) => fetchPendingSubmissionsMock(...a) }));
vi.mock('@/lib/feedback', () => ({ fetchFeedback: (...a: unknown[]) => fetchFeedbackMock(...a) }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => channelMock,
    removeChannel: (...a: unknown[]) => removeChannelMock(...a),
  },
}));

import { useSuperAdminAlerts } from '@/hooks/useSuperAdminAlerts';

beforeEach(() => {
  mockRole = 'superadmin';
  broadcastHandlers = [];
  fetchPendingSubmissionsMock.mockReset().mockResolvedValue([]);
  fetchFeedbackMock.mockReset().mockResolvedValue([]);
  channelMock.on.mockClear();
  channelMock.subscribe.mockClear();
  removeChannelMock.mockClear();
});

describe('useSuperAdminAlerts', () => {
  it('soma comprovativos pendentes + feedback por ler', async () => {
    fetchPendingSubmissionsMock.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    fetchFeedbackMock.mockResolvedValue([{ id: 'f1', status: 'unread' }, { id: 'f2', status: 'read' }]);

    const { result } = renderHook(() => useSuperAdminAlerts());
    await waitFor(() => expect(result.current).toBe(3)); // 2 pendentes + 1 não lido
  });

  it('não faz nada (fica em 0) para quem não é superadmin', async () => {
    mockRole = 'admin';
    fetchPendingSubmissionsMock.mockResolvedValue([{ id: 'p1' }]);

    const { result } = renderHook(() => useSuperAdminAlerts());
    await new Promise(r => setTimeout(r, 20));
    expect(result.current).toBe(0);
    expect(fetchPendingSubmissionsMock).not.toHaveBeenCalled();
  });

  it('recalcula quando chega um evento Realtime em qualquer uma das tabelas', async () => {
    fetchPendingSubmissionsMock.mockResolvedValue([]);
    fetchFeedbackMock.mockResolvedValue([]);
    const { result } = renderHook(() => useSuperAdminAlerts());
    await waitFor(() => expect(result.current).toBe(0));

    fetchPendingSubmissionsMock.mockResolvedValue([{ id: 'p1' }]);
    broadcastHandlers.forEach(h => h());

    await waitFor(() => expect(result.current).toBe(1));
  });

  it('remove o canal ao desmontar', async () => {
    const { unmount } = renderHook(() => useSuperAdminAlerts());
    await waitFor(() => expect(channelMock.subscribe).toHaveBeenCalled());
    unmount();
    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
