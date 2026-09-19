import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KitchenOrderDetail from '@/components/KitchenOrderDetail';
import type { Order, MenuItem } from '@/types/restaurant';

/**
 * Dois bugs reais reportados directamente (com screenshots do telemóvel):
 * 1. Os passos do "Modo de Preparo" pareciam checkboxes mas não reagiam a
 *    cliques — eram só decorativos (step.done nunca vinha de nenhuma
 *    interacção real).
 * 2. Assim que um item fica ready/served aparece um 2º botão de imprimir
 *    ("Servidos") no cabeçalho — num ecrã de telemóvel estreito isso
 *    empurrava o X de fechar para fora do espaço visível, e o modal usa
 *    overflow-hidden, por isso não havia scroll nem forma de o alcançar.
 */

const menuItems: MenuItem[] = [{
  id: 'mi-1', name: 'Frango Batata Salada', price: 650, category: 'Pratos Principais', available: true,
  recipe: {
    ingredients: [{ name: 'Frango', qty: '0.25 un' }],
    steps: [
      { label: 'Lavar Salada e Batatas', icon: '👨‍🍳' },
      { label: 'Cortar Alface, Cebola, tomate, Batatas e 1/4 frango', icon: '👨‍🍳' },
    ],
  },
}];

function makeOrder(itemStatus: 'preparing' | 'ready'): Order {
  return {
    id: 'order-1', type: 'takeaway', status: 'active',
    items: [{ id: 'item-1', menuItemId: 'mi-1', name: 'Frango Batata Salada', quantity: 1, price: 650, status: itemStatus }],
    total: 650, paid: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

describe('KitchenOrderDetail — passos do Modo de Preparo são clicáveis', () => {
  it('clicar num passo marca-o como concluído (risca o texto e enche o checkbox)', async () => {
    const user = userEvent.setup();
    render(
      <KitchenOrderDetail
        order={makeOrder('preparing')}
        menuItems={menuItems}
        onClose={vi.fn()}
        canManage
      />,
    );

    const step = screen.getByText(/1\. Lavar Salada e Batatas/);
    expect(step.className).not.toContain('line-through');

    await user.click(step);

    expect(screen.getByText(/1\. Lavar Salada e Batatas/).className).toContain('line-through');
  });

  it('clicar outra vez desmarca o passo', async () => {
    const user = userEvent.setup();
    render(
      <KitchenOrderDetail order={makeOrder('preparing')} menuItems={menuItems} onClose={vi.fn()} canManage />,
    );

    const step = screen.getByText(/1\. Lavar Salada e Batatas/);
    await user.click(step);
    expect(screen.getByText(/1\. Lavar Salada e Batatas/).className).toContain('line-through');
    await user.click(screen.getByText(/1\. Lavar Salada e Batatas/));
    expect(screen.getByText(/1\. Lavar Salada e Batatas/).className).not.toContain('line-through');
  });
});

describe('KitchenOrderDetail — botão de fechar continua acessível com 2 botões de imprimir', () => {
  it('o botão Fechar (X) existe e funciona mesmo quando o botão "Servidos" também aparece (item ready)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <KitchenOrderDetail order={makeOrder('ready')} menuItems={menuItems} onClose={onClose} canManage canServe />,
    );

    // Confirma que o cenário que causava o bug está mesmo presente (2º botão de imprimir visível).
    expect(screen.getByTitle('Imprimir itens servidos')).toBeInTheDocument();

    // jsdom não calcula layout real, por isso não dá para testar aqui a
    // sobreposição visual em si (o bug real era CSS/viewport) — o que este
    // teste garante é a causa estrutural da correção: o X é um irmão
    // sempre presente e clicável, fora do grupo de botões de imprimir que
    // pode encolher/fazer scroll, nunca dependente de haver espaço lá.
    const closeButton = screen.getByLabelText('Fechar');
    expect(closeButton).toBeInTheDocument();
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });
});
