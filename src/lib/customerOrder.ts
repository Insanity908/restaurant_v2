/**
 * Fluxo de pedido pelo próprio cliente (QR na mesa / entrega), sem sessão
 * Supabase Auth. Caminho fino, directo ao Supabase — não passa pelo
 * orderStore/outbox local-first que o resto da app usa (esse pressupõe
 * sempre um tenant autenticado em localStorage, que aqui não existe).
 */
import { supabase } from '@/integrations/supabase/client';
import type { MenuItem } from '@/types/restaurant';

export type PublicMenuItem = MenuItem;

export interface PublicBranding {
  brandName?: string;
  iconEmoji?: string;
  iconUrl?: string;
  primaryHue?: number;
  primarySaturation?: number;
  primaryLightness?: number;
  backgroundHue?: number;
  backgroundSaturation?: number;
  backgroundLightness?: number;
}

/** Marca/cores do restaurante para a página pública — ver get_public_branding(). */
export async function fetchPublicBranding(tenantId: string): Promise<PublicBranding | null> {
  const { data, error } = await supabase.rpc('get_public_branding', { p_tenant_id: tenantId });
  if (error) { console.warn('fetchPublicBranding failed', error.message); return null; }
  if (!data || typeof data !== 'object') return null;
  return data as PublicBranding;
}

/** Cardápio público de um tenant — só itens disponíveis (RLS já filtra isso para `anon`). */
export async function fetchPublicMenu(tenantId: string): Promise<PublicMenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price, category, description, image_path, modifiers, available')
    .eq('tenant_id', tenantId)
    .eq('available', true)
    .order('category', { ascending: true });
  if (error) { console.warn('fetchPublicMenu failed', error.message); return []; }
  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    category: r.category,
    description: r.description ?? undefined,
    image: r.image_path ?? undefined,
    modifiers: (r.modifiers as MenuItem['modifiers']) ?? undefined,
    available: r.available,
  }));
}

export interface LoyaltyCustomer {
  id: string;
  name: string;
  address?: string;
}

/** Confirma que o telefone já está registado na fidelização deste tenant, antes de avançar para entrega. */
export async function verifyLoyaltyCustomer(tenantId: string, phone: string): Promise<LoyaltyCustomer | null> {
  const { data, error } = await supabase.rpc('verify_loyalty_customer', { p_tenant_id: tenantId, p_phone: phone });
  if (error) { console.warn('verifyLoyaltyCustomer failed', error.message); return null; }
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (!row.id) return null;
  return { id: row.id as string, name: row.name as string, address: (row.address as string) ?? undefined };
}

export interface CustomerCartItem {
  menuItemId: string;
  quantity: number;
  modifierIds?: string[];
  notes?: string;
}

export interface SubmitCustomerOrderParams {
  tenantId: string;
  tableId?: string;
  customerPhone?: string;
  customerName?: string;
  deliveryAddress?: string;
  items: CustomerCartItem[];
  /** Gerada uma vez por visita à página (ver CustomerOrderPage) — reenviada
   *  em qualquer nova tentativa do mesmo carrinho, para que um duplo-toque
   *  ou um retry de rede devolva o pedido já criado em vez de criar outro
   *  (e descontar o estoque outra vez). */
  idempotencyKey?: string;
}

/** Submete o carrinho. Devolve o id do pedido (para a página de acompanhamento) ou null se falhou. */
export async function submitCustomerOrder(params: SubmitCustomerOrderParams): Promise<string | null> {
  const { data, error } = await supabase.rpc('submit_customer_order', {
    p_tenant_id: params.tenantId,
    p_table_id: params.tableId ?? null,
    p_customer_phone: params.customerPhone ?? null,
    p_customer_name: params.customerName ?? null,
    p_delivery_address: params.deliveryAddress ?? null,
    p_items: params.items.map(i => ({
      menu_item_id: i.menuItemId,
      quantity: i.quantity,
      modifiers: (i.modifierIds ?? []).map(id => ({ id })),
      notes: i.notes,
    })) as never,
    p_idempotency_key: params.idempotencyKey ?? null,
  });
  if (error) { console.warn('submitCustomerOrder failed', error.message); return null; }
  return (data as string) ?? null;
}

export interface OrderStatusItem {
  name: string;
  quantity: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
}

export interface OrderStatusView {
  id: string;
  status: string;
  type: string;
  tableNumber?: number;
  total: number;
  createdAt: string;
  items: OrderStatusItem[];
}

/** Estado do pedido para a página pública de acompanhamento — chamado por polling. */
export async function getOrderStatus(orderId: string): Promise<OrderStatusView | null> {
  const { data, error } = await supabase.rpc('get_order_status', { p_order_id: orderId });
  if (error) { console.warn('getOrderStatus failed', error.message); return null; }
  if (!data || typeof data !== 'object' || !(data as Record<string, unknown>).id) return null;
  return data as unknown as OrderStatusView;
}
