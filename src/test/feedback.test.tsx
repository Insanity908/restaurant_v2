import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// FeedbackDialog — qualquer papel pode enviar feedback ao superadmin.
// ---------------------------------------------------------------------------
describe('FeedbackDialog', () => {
  const submitFeedbackMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    submitFeedbackMock.mockReset().mockResolvedValue(true);
    localStorage.clear();
    localStorage.setItem('current_tenant_id', 'tenant-1');
    vi.doMock('@/context/AuthContext', () => ({
      useOptionalAuth: () => ({
        user: { id: 'waiter-1', name: 'Garçom Teste', role: 'waiter', tenantId: 'tenant-1' },
      }),
    }));
    vi.doMock('@/lib/feedback', () => ({
      submitFeedback: submitFeedbackMock,
    }));
  });

  it('envia o feedback com o nome/papel do utilizador actual', async () => {
    const { default: FeedbackDialog } = await import('@/components/FeedbackDialog');
    const user = userEvent.setup();
    render(<FeedbackDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByPlaceholderText('Escreva aqui...'), 'O ecrã de caixa está lento');
    await user.click(screen.getByRole('button', { name: /^enviar$/i }));

    await waitFor(() => expect(submitFeedbackMock).toHaveBeenCalledWith(
      'tenant-1', 'Garçom Teste', 'waiter', 'O ecrã de caixa está lento',
    ));
  });

  it('não deixa enviar mensagem vazia', async () => {
    const { default: FeedbackDialog } = await import('@/components/FeedbackDialog');
    render(<FeedbackDialog open onOpenChange={() => {}} />);

    expect(screen.getByRole('button', { name: /^enviar$/i })).toBeDisabled();
    expect(submitFeedbackMock).not.toHaveBeenCalled();
  });
});
