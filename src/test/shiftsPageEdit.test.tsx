import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Shift } from '@/types/restaurant';

/**
 * T2.4: managers podem corrigir manualmente `clockIn`/`clockOut` de um
 * turno (ex.: alguém esqueceu-se de bater a saída e o turno ficou "Em
 * curso" para sempre). Cobre: botão só visível para quem tem
 * `shifts.manage`, e a validação que impede gravar uma saída antes da
 * entrada.
 */

let mockCanManage = true;
const updateMock = vi.fn();

const OPEN_SHIFT: Shift = {
  id: 'shift-1', staffId: 'u1', staffName: 'Ana', staffRole: 'waiter',
  clockIn: '2026-08-20T08:00:00.000Z',
};

// Mesma conversão que `toLocalInputValue` em ShiftsPage.tsx — duplicada aqui
// (não exportada) para gerar valores de teste relativos ao clockIn na
// timezone local da máquina que corre o teste, em vez de horas fixas que
// quebrariam fora de UTC.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/context/AuthContext')>('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', name: 'Ana', role: 'waiter', tenantId: 'tenant-1', tenantIds: [] },
      hasPermission: () => mockCanManage,
    }),
  };
});

vi.mock('@/lib/store', () => ({
  shiftStore: {
    getAll: () => [OPEN_SHIFT],
    update: updateMock,
  },
  staffStore: { getAll: () => [] },
  fetchShifts: vi.fn().mockResolvedValue([OPEN_SHIFT]),
}));

async function renderShiftsPage() {
  const { default: ShiftsPage } = await import('@/pages/ShiftsPage');
  return render(<ShiftsPage />);
}

describe('ShiftsPage — edição manual de turnos (manager)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCanManage = true;
    updateMock.mockReset();
  });

  it('esconde o botão "Editar" de quem não tem shifts.manage', async () => {
    mockCanManage = false;
    await renderShiftsPage();
    await screen.findByText('Histórico de Turnos');
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('um manager consegue corrigir a saída de um turno "Em curso"', async () => {
    const user = userEvent.setup();
    await renderShiftsPage();
    await screen.findByText('Histórico de Turnos');

    // O botão de editar é o único ícone-botão dentro da linha do histórico — localizamos pelo container da tabela.
    const table = screen.getByRole('table');
    const editButtonInTable = Array.from(table.querySelectorAll('button'))[0] as HTMLElement;
    await user.click(editButtonInTable);

    const clockOutValue = toLocalInputValue(new Date(new Date(OPEN_SHIFT.clockIn).getTime() + 8 * 3600_000));
    const clockOutInput = await screen.findByLabelText('Saída');
    await user.type(clockOutInput, clockOutValue);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [id, updates] = updateMock.mock.calls[0];
    expect(id).toBe('shift-1');
    expect(updates.clockOut).toBe(new Date(clockOutValue).toISOString());
  });

  it('rejeita gravar uma saída antes ou igual à entrada', async () => {
    const user = userEvent.setup();
    await renderShiftsPage();
    await screen.findByText('Histórico de Turnos');

    const table = screen.getByRole('table');
    const editButtonInTable = Array.from(table.querySelectorAll('button'))[0] as HTMLElement;
    await user.click(editButtonInTable);

    const clockOutValue = toLocalInputValue(new Date(new Date(OPEN_SHIFT.clockIn).getTime() - 3600_000));
    const clockOutInput = await screen.findByLabelText('Saída');
    await user.type(clockOutInput, clockOutValue);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(updateMock).not.toHaveBeenCalled();
  });
});
