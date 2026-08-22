import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MenuItemDialog from '@/components/MenuItemDialog';
import type { MenuItem, InventoryItem } from '@/types/restaurant';

/**
 * Dois comportamentos novos nesta sessão: (1) validação de nome duplicado no
 * cardápio, e (2) a UI simplificada de "Bebidas" (liga directo a UM item do
 * inventário em vez de receita completa) — troca de categoria activa limpa
 * passos/tempo/ingredientes de texto livre, mas abrir um item que já É
 * Bebidas não deve apagar nada só por montar o diálogo.
 */

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const toastMock = await import('sonner');

const PIZZA: MenuItem = {
  id: 'menu-pizza', name: 'Pizza Margherita', price: 500, category: 'Pratos Principais', available: true,
};

const BEBIDA_INGREDIENTE: InventoryItem = {
  id: 'inv-coca', name: 'Coca-Cola', unit: 'un', currentStock: 50, minStock: 5,
  costPerUnit: 40, linkedMenuItemIds: [], usagePerServing: 1,
};

function noop() {}

/** A categoria nativa `<select>` também tem role "combobox" (ARIA implícito),
 *  tal como o Select do Radix — quando ambos coexistem no DOM, distingue-se
 *  pela tag (o do Radix é um `<button>`). */
function bebidaCombobox(): HTMLElement {
  const combo = screen.getAllByRole('combobox').find(el => el.tagName === 'BUTTON');
  if (!combo) throw new Error('Combobox de vínculo ao inventário não encontrado');
  return combo;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MenuItemDialog — nome duplicado', () => {
  it('bloqueia criar um item com o mesmo nome (case-insensitive, espaços) de um já existente', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <MenuItemDialog open onClose={noop} onSave={onSave} menuItems={[PIZZA]} />
    );

    await user.type(screen.getByPlaceholderText('Ex: Pizza Margherita'), '  pizza margherita  ');
    await user.type(screen.getByPlaceholderText('0'), '600');
    await user.click(screen.getByRole('button', { name: /criar item/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(toastMock.toast.error).toHaveBeenCalledWith(expect.stringContaining('Pizza Margherita'));
  });

  it('editar o próprio item mantendo o nome não dispara falso positivo de duplicado', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <MenuItemDialog open onClose={noop} onSave={onSave} item={PIZZA} menuItems={[PIZZA]} />
    );

    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    expect(toastMock.toast.error).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'menu-pizza', name: 'Pizza Margherita' });
  });

  it('permite dois itens com nomes diferentes sem falso positivo', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<MenuItemDialog open onClose={noop} onSave={onSave} menuItems={[PIZZA]} />);

    await user.type(screen.getByPlaceholderText('Ex: Pizza Margherita'), 'Lasanha');
    await user.type(screen.getByPlaceholderText('0'), '450');
    await user.click(screen.getByRole('button', { name: /criar item/i }));

    expect(toastMock.toast.error).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('MenuItemDialog — categoria "Bebidas"', () => {
  const ITEM_WITH_RECIPE: MenuItem = {
    id: 'menu-frango', name: 'Frango Grelhado', price: 350, category: 'Pratos Principais', available: true,
    recipe: {
      ingredients: [{ name: 'Frango', qty: '300g' }],
      steps: [{ label: 'Grelhar 10 min' }],
      temp: '200°C',
    },
  };

  it('trocar activamente para Bebidas limpa passos/tempo (não reaparecem ao voltar para outra categoria)', async () => {
    const user = userEvent.setup();
    render(<MenuItemDialog open onClose={noop} onSave={vi.fn()} item={ITEM_WITH_RECIPE} />);

    // Confirma que a receita está lá antes de trocar.
    expect(screen.getByDisplayValue('Grelhar 10 min')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200°C')).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue('Pratos Principais'), 'Bebidas');
    // UI de Bebidas substitui a secção de receita — passos/tempo já não são visíveis.
    expect(screen.queryByDisplayValue('Grelhar 10 min')).not.toBeInTheDocument();

    // Voltar para uma categoria com receita: se o estado tivesse sido só
    // escondido (não limpo), os passos/tempo antigos reapareceriam aqui.
    await user.selectOptions(screen.getByDisplayValue('Bebidas'), 'Entradas');
    expect(screen.getByText('Sem passos — será usado um padrão.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: 220°C / 10m')).toHaveValue('');
  });

  it('abrir um item que já É Bebidas não apaga o ingrediente ligado ao inventário', () => {
    const item: MenuItem = {
      id: 'menu-coca', name: 'Coca-Cola 300ml', price: 60, category: 'Bebidas', available: true,
      recipe: { ingredients: [{ name: 'Coca-Cola', qty: '1 un', inventoryItemId: 'inv-coca' }], steps: [] },
    };
    render(<MenuItemDialog open onClose={noop} onSave={vi.fn()} item={item} inventory={[BEBIDA_INGREDIENTE]} />);

    // Texto de ajuda só aparece quando `bebidaInvId` está preenchido — prova
    // que o ingrediente ligado sobreviveu ao simples acto de abrir o diálogo.
    expect(screen.getByText(/cada pedido servido desconta 1 un deste item/i)).toBeInTheDocument();
  });

  it('vincula uma bebida nova ao inventário e mostra o texto de desconto de stock', async () => {
    const user = userEvent.setup();
    render(<MenuItemDialog open onClose={noop} onSave={vi.fn()} inventory={[BEBIDA_INGREDIENTE]} />);

    await user.selectOptions(screen.getByDisplayValue('Popular'), 'Bebidas');
    await user.click(bebidaCombobox());
    await user.click(await screen.findByText(/coca-cola \(50 un\)/i));

    expect(await screen.findByText(/cada pedido servido desconta 1 un deste item/i)).toBeInTheDocument();
  });

  it('herda a imagem do inventário quando o item ainda não tem imagem própria', async () => {
    const comInvImagem: InventoryItem = { ...BEBIDA_INGREDIENTE, image: 'https://example.com/coca.jpg' };
    const user = userEvent.setup();
    render(<MenuItemDialog open onClose={noop} onSave={vi.fn()} inventory={[comInvImagem]} />);

    await user.selectOptions(screen.getByDisplayValue('Popular'), 'Bebidas');
    await user.click(bebidaCombobox());
    await user.click(await screen.findByText(/coca-cola \(50 un\)/i));

    expect(await screen.findByAltText('Preview')).toHaveAttribute('src', 'https://example.com/coca.jpg');
  });

  it('NÃO substitui uma imagem já escolhida pelo utilizador ao vincular ao inventário', async () => {
    const comInvImagem: InventoryItem = { ...BEBIDA_INGREDIENTE, image: 'https://example.com/coca.jpg' };
    const itemComImagemPropria: MenuItem = {
      id: 'menu-fanta', name: 'Fanta', price: 60, category: 'Bebidas', available: true,
      image: 'https://example.com/fanta-original.jpg',
    };
    const user = userEvent.setup();
    render(<MenuItemDialog open onClose={noop} onSave={vi.fn()} item={itemComImagemPropria} inventory={[comInvImagem]} />);

    await user.click(bebidaCombobox());
    await user.click(await screen.findByText(/coca-cola \(50 un\)/i));

    expect(await screen.findByAltText('Preview')).toHaveAttribute('src', 'https://example.com/fanta-original.jpg');
  });
});
