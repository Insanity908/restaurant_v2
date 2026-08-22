/**
 * Busca de dados de um ano inteiro para o Arquivo de Dados (relatório anual,
 * recibos e limpeza de dados antigos — ver DataArchivePage). Ao contrário de
 * fetchOrders()/fetchShifts() em store.ts (capados a 500 linhas para as
 * vistas ao vivo da app), estas funções paginam sem limite — um ano de
 * pedidos de um restaurante activo facilmente ultrapassa o cap de 1000 linhas
 * por pedido do PostgREST.
 */
import { supabase } from '@/integrations/supabase/client';
import { mapOrderRow } from './store';
import type { Order, Shift, SecurityAlert } from '@/types/restaurant';

const PAGE = 1000;

export async function fetchOrdersInRange(tenantId: string, start: Date, end: Date): Promise<Order[]> {
  const all: Order[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), order_events(*), order_payments(*)')
      .eq('tenant_id', tenantId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []).map(mapOrderRow);
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function fetchShiftsInRange(tenantId: string, start: Date, end: Date): Promise<Shift[]> {
  const all: Shift[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('clock_in', start.toISOString())
      .lt('clock_in', end.toISOString())
      .order('clock_in', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows: Shift[] = (data ?? []).map(r => ({
      id: r.id, staffId: r.staff_id, staffName: r.staff_name,
      staffRole: r.staff_role as Shift['staffRole'], clockIn: r.clock_in,
      clockOut: r.clock_out ?? undefined, notes: r.notes ?? undefined,
    }));
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function fetchSecurityAlertsInRange(tenantId: string, start: Date, end: Date): Promise<SecurityAlert[]> {
  const all: SecurityAlert[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('security_alerts')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows: SecurityAlert[] = (data ?? []).map(r => ({
      id: r.id, type: r.type as SecurityAlert['type'], message: r.message,
      attemptedPin: r.attempted_pin ?? undefined, attempts: r.attempts ?? 1,
      read: r.read, createdAt: r.created_at,
    }));
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
