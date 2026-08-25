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

export interface ArchivedReport {
  id: string;
  year: number;
  /** 0 = resumo do ano inteiro; 1-12 = um mês específico. */
  month: number;
  storagePath: string;
  status: 'archived' | 'purged';
  totalRevenue: number | null;
  totalOrders: number | null;
  archivedAt: string;
}

/** Anos/meses já arquivados automaticamente (ver edge function
 *  archive-old-years) para este tenant — só leitura, para o admin poder
 *  descarregar o Excel de um ano/mês cujos dados em bruto já foram apagados. */
export async function fetchArchivedReports(tenantId: string): Promise<ArchivedReport[]> {
  const { data, error } = await supabase
    .from('archived_reports')
    .select('id, year, month, storage_path, status, total_revenue, total_orders, archived_at')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: false })
    .order('month', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, year: r.year, month: r.month, storagePath: r.storage_path,
    status: r.status as ArchivedReport['status'],
    totalRevenue: r.total_revenue === null ? null : Number(r.total_revenue),
    totalOrders: r.total_orders,
    archivedAt: r.archived_at,
  }));
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
