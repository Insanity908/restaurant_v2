// Image map for menu items
import pizzaImg from '@/assets/pizza.jpg';
import burgerImg from '@/assets/burger.jpg';
import sushiImg from '@/assets/sushi.jpg';
import chickenImg from '@/assets/chicken.jpg';
import type { MenuItem } from '@/types/restaurant';

const imageMap: Record<string, string> = {
  'Pizza Pepperoni': pizzaImg,
  'Hambúrguer Gourmet': burgerImg,
  'Sushi Roll Misto': sushiImg,
  'Frango Grelhado': chickenImg,
};

export function getMenuItemImage(name: string): string | undefined {
  return imageMap[name];
}

/** Caminho de storage da imagem escolhida/carregada no cadastro do prato (para usar com StorageImage). */
export function findMenuItemImagePath(menuItemId: string, menuItems: MenuItem[]): string | undefined {
  return menuItems.find(m => m.id === menuItemId)?.image;
}

export function formatPrice(value: number): string {
  return `${value.toLocaleString()} MT`;
}

/** Junta nomes com vírgula, cortando com "…" antes de ultrapassar maxChars — nunca corta um nome a meio. */
export function truncateList(names: string[], maxChars = 90): string {
  let result = '';
  for (const name of names) {
    const candidate = result ? `${result}, ${name}` : name;
    if (candidate.length > maxChars) {
      return result ? `${result}…` : `${name.slice(0, Math.max(0, maxChars - 1))}…`;
    }
    result = candidate;
  }
  return result;
}
