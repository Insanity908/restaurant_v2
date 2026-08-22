import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OutboxState, WriteOp } from '@/lib/outbox';

/**
 * T3.1: `SyncStatus.tsx` ganhou um aviso visível quando a fila se aproxima
 * do tecto (`OUTBOX_WARN_AT`), e a confirmação de "Limpar fila" passou a
 * mostrar um resumo por tabela do que vai ser descartado, não só uma
 * contagem — para o utilizador perceber o impacto antes de confirmar.
 */

let mockState: OutboxState = { pending: 0, failed: 0, ops: [] };
const clearOutboxMock = vi.fn();

vi.mock('@/lib/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outbox')>();
  return {
    ...actual,
    subscribeOutbox: (cb: (s: OutboxState) => void) => { cb(mockState); return () => {}; },
    flushOutbox: vi.fn().mockResolvedValue(undefined),
    retryOutbox: vi.fn(),
    clearOutbox: clearOutboxMock,
  };
});

function op(table: string, overrides: Partial<WriteOp> = {}): WriteOp {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), table, action: 'update', values: {}, ...overrides };
}

async function renderSyncStatus() {
  const { default: SyncStatus } = await import('@/components/SyncStatus');
  return render(<SyncStatus />);
}

describe('SyncStatus — aviso de fila grande e resumo antes de limpar', () => {
  beforeEach(() => {
    vi.resetModules();
    clearOutboxMock.mockReset();
  });

  it('mostra o resumo normal (pendentes) quando a fila está longe do limite', async () => {
    mockState = { pending: 3, failed: 0, ops: Array.from({ length: 3 }, () => op('customers')) };
    await renderSyncStatus();
    expect(await screen.findByText(/A sincronizar 3 alterações/)).toBeInTheDocument();
    expect(screen.queryByText(/Fila muito grande/)).not.toBeInTheDocument();
  });

  it('mostra "Fila muito grande" quando a contagem atinge OUTBOX_WARN_AT', async () => {
    const { OUTBOX_WARN_AT } = await import('@/lib/outbox');
    mockState = { pending: OUTBOX_WARN_AT, failed: 0, ops: Array.from({ length: OUTBOX_WARN_AT }, () => op('customers')) };
    await renderSyncStatus();
    expect(await screen.findByText(new RegExp(`Fila muito grande \\(${OUTBOX_WARN_AT}\\)`))).toBeInTheDocument();
  });

  it('"Limpar fila" mostra um resumo por tabela antes de confirmar', async () => {
    mockState = {
      pending: 3, failed: 0,
      ops: [op('orders'), op('orders'), op('shifts')],
    };
    const user = userEvent.setup();
    await renderSyncStatus();

    await user.click(await screen.findByRole('button', { name: /A sincronizar/ }));
    await user.click(screen.getByRole('button', { name: /Limpar fila/ }));

    expect(await screen.findByText(/2 Pedidos, 1 Turno/)).toBeInTheDocument();
  });

  it('confirmar no diálogo chama clearOutbox', async () => {
    mockState = { pending: 1, failed: 0, ops: [op('customers')] };
    const user = userEvent.setup();
    await renderSyncStatus();

    await user.click(await screen.findByRole('button', { name: /A sincronizar/ }));
    await user.click(screen.getByRole('button', { name: /Limpar fila/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Limpar fila' }));

    expect(clearOutboxMock).toHaveBeenCalled();
  });
});
