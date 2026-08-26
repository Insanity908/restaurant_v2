import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

/**
 * T3.6: modo TV da Cozinha. Cobre o lado de `KitchenPage.tsx`: o botão
 * "Modo TV" acrescenta `?tv=1` à URL (que é o que `shouldHideSidebar` em
 * App.tsx lê para esconder a sidebar — testado à parte em
 * kitchenTvMode.test.tsx) e alarga a grelha; "Sair do modo TV" remove-o.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'k-1', name: 'Cozinha', role: 'kitchen' },
    hasPermission: (p: string) => p === 'kitchen.manage',
  }),
}));
vi.mock('@/hooks/useRestaurant', () => ({
  useRestaurant: () => ({ orders: [], updateOrderItemStatus: vi.fn(), updateOrder: vi.fn(), cancelOrder: vi.fn(), menuItems: [] }),
}));

let lastSearch = '';
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

async function renderKitchen(initialSearch = '') {
  const { default: KitchenPage } = await import('@/pages/KitchenPage');
  return render(
    <MemoryRouter initialEntries={[`/kitchen${initialSearch}`]}>
      <LocationProbe />
      <Routes><Route path="/kitchen" element={<KitchenPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('KitchenPage — alternância do modo TV', () => {
  beforeEach(() => { vi.resetModules(); lastSearch = ''; });

  it('"Modo TV" acrescenta ?tv=1 à URL', async () => {
    const user = userEvent.setup();
    await renderKitchen();

    await user.click(screen.getByRole('button', { name: /modo tv/i }));

    expect(lastSearch).toBe('?tv=1');
  });

  it('em ?tv=1, mostra "Sair do modo TV" em vez de "Modo TV", e sair remove o parâmetro', async () => {
    const user = userEvent.setup();
    await renderKitchen('?tv=1');

    expect(screen.queryByRole('button', { name: /^modo tv$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sair do modo tv/i }));

    expect(lastSearch).toBe('');
  });
});
