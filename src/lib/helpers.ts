// Image map for menu items
import pizzaImg from '@/assets/pizza.jpg';
import burgerImg from '@/assets/burger.jpg';
import sushiImg from '@/assets/sushi.jpg';
import chickenImg from '@/assets/chicken.jpg';

const imageMap: Record<string, string> = {
  'Pizza Pepperoni': pizzaImg,
  'Hambúrguer Gourmet': burgerImg,
  'Sushi Roll Misto': sushiImg,
  'Frango Grelhado': chickenImg,
};

export function getMenuItemImage(name: string): string | undefined {
  return imageMap[name];
}

/** Imagens padrão que o dono do restaurante pode escolher em vez de carregar uma própria. */
export const PRESET_MENU_IMAGES: { label: string; url: string }[] = [
  { label: 'Pizza', url: pizzaImg },
  { label: 'Hambúrguer', url: burgerImg },
  { label: 'Sushi', url: sushiImg },
  { label: 'Frango', url: chickenImg },
];

export function formatPrice(value: number): string {
  return `${value.toLocaleString()} MT`;
}
