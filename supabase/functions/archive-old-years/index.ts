// Arquivamento automático de dados por ano civil.
//
// Duas formas de invocar:
//  - Modo cron (automático, todos os dias): cabeçalho `x-cron-secret` a
//    bater certo com a variável de ambiente CRON_SECRET. Processa até
//    MAX_PER_RUN pares (tenant, ano) elegíveis (ver find_due_archive_years,
//    na migração 20260825201500_archived_reports.sql), de todos os tenants.
//  - Modo manual (superadmin): JWT normal + `{ tenantId, year }` no corpo —
//    força o arquivamento de um par específico já hoje, sem esperar pelo
//    cron. Usa exactamente o mesmo caminho interno (`archiveYear`).
//
// Por cada (tenant, ano) devido: gera um .xlsx do ano inteiro MAIS um .xlsx
// por cada mês desse ano com pedidos pagos — mesmas 7 folhas que
// src/lib/exportExcel.ts já produz do lado do cliente (Resumo, Vendas
// Mensais, Mais Vendidos, Categorias, Pagamentos, Despesas e Salários,
// Transações). Só depois de TODOS esses ficheiros confirmados em
// `archived_reports` é que os dados em bruto desse ano (orders — cascata
// automática para order_items/order_events/order_payments —, shifts,
// security_alerts) são apagados. Nunca apaga despesas/salários/clientes/
// catálogo/equipa/configuração — mesmo âmbito que purge-old-data já respeita.
//
// Idempotente e retomável: se a função cair a meio, a corrida seguinte
// (mesmo tenant/ano) salta os ficheiros já confirmados em `archived_reports`
// e só reprocessa o que falta, nunca regenera/substitui um ficheiro já
// gravado.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import * as XLSX from 'npm:xlsx@0.18.5';

const MAX_PER_RUN = 5;
const PAGE = 1000;

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// -- Tipos mínimos (só os campos que os cálculos abaixo realmente usam) -----

interface OrderItemRow { menu_item_id: string | null; name: string; quantity: number; price: number }
interface OrderRow {
  id: string; created_at: string; type: 'dine-in' | 'takeaway' | 'delivery';
  table_number: number | null; total: number; tip: number | null;
  payment_method: 'cash' | 'card' | 'mobile-money' | null; paid: boolean;
  order_items: OrderItemRow[];
}
interface InventoryRow { linked_menu_item_ids: string[]; cost_per_unit: number; usage_per_serving: number }
interface MenuItemRow { id: string; category: string }
interface FixedCosts { recurringMonthly: number; oneTime: number }

// -- Pedidos do ano inteiro, paginado (mesmo padrão de fetchOrdersInRange, --
// -- src/lib/dataArchive.ts) --------------------------------------------------

async function fetchOrdersForYear(admin: SupabaseClient, tenantId: string, year: number): Promise<OrderRow[]> {
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
  const all: OrderRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('orders')
      .select('id, created_at, type, table_number, total, tip, payment_method, paid, order_items(menu_item_id, name, quantity, price)')
      .eq('tenant_id', tenantId)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as OrderRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// -- Despesas fixas as-of uma data (porta de src/lib/expenses.ts:126-171) ---

async function fetchFixedCostsAsOf(admin: SupabaseClient, tenantId: string, asOf: Date): Promise<FixedCosts> {
  const [expRes, histRes, salRes] = await Promise.all([
    admin.from('expenses').select('*').eq('tenant_id', tenantId),
    admin.from('expense_amount_history').select('expense_id, amount, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    admin.from('staff_salaries').select('staff_id, salary, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
  ]);
  if (expRes.error || histRes.error || salRes.error) return { recurringMonthly: 0, oneTime: 0 };

  const historyByExpense = new Map<string, { amount: number; createdAt: string }[]>();
  (histRes.data ?? []).forEach(r => {
    const list = historyByExpense.get(r.expense_id) ?? [];
    list.push({ amount: Number(r.amount), createdAt: r.created_at });
    historyByExpense.set(r.expense_id, list);
  });

  let recurringMonthly = 0;
  let oneTime = 0;
  (expRes.data ?? []).forEach(row => {
    if (new Date(row.created_at) > asOf) return;
    if (row.recurring) {
      if (row.archived_at && new Date(row.archived_at) <= asOf) return;
      const hist = historyByExpense.get(row.id) ?? [];
      const atPeriod = [...hist].reverse().find(h => new Date(h.createdAt) <= asOf);
      recurringMonthly += atPeriod ? atPeriod.amount : Number(row.amount);
    } else if (row.expense_date) {
      const d = new Date(row.expense_date);
      if (d > asOf) return;
      oneTime += Number(row.amount);
    }
  });

  const latestByStaff = new Map<string, { salary: number; createdAt: string }>();
  (salRes.data ?? []).forEach(r => {
    if (new Date(r.created_at) > asOf) return;
    const cur = latestByStaff.get(r.staff_id);
    if (!cur || r.created_at > cur.createdAt) latestByStaff.set(r.staff_id, { salary: Number(r.salary), createdAt: r.created_at });
  });
  latestByStaff.forEach(s => { recurringMonthly += s.salary; });

  return { recurringMonthly, oneTime };
}

// -- Estatísticas de um período (porta de src/lib/reportStats.ts) -----------

function computeStats(orders: OrderRow[], inventory: InventoryRow[], fixedCosts: FixedCosts, ivaRate: number, days: number) {
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total) + Number(o.tip || 0), 0);
  const totalOrders = orders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  let totalCost = 0;
  orders.forEach(o => {
    o.order_items.forEach(item => {
      inventory.forEach(inv => {
        if (item.menu_item_id && inv.linked_menu_item_ids.includes(item.menu_item_id)) {
          totalCost += inv.cost_per_unit * inv.usage_per_serving * item.quantity;
        }
      });
    });
  });
  const fixedCostsTotal = fixedCosts.recurringMonthly * (days / 30) + fixedCosts.oneTime;
  const ivaAmount = totalRevenue * (ivaRate / 100);
  const profit = totalRevenue - totalCost - fixedCostsTotal - ivaAmount;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  return { totalRevenue, totalOrders, avgTicket, totalCost, profit, margin };
}

// -- Payload de um período (porta de DataArchivePage.tsx:121-227) -----------

interface PeriodPayload {
  year: number; monthLabel?: string;
  stats: ReturnType<typeof computeStats>;
  expenses: { recurringMonthly: number; oneTime: number; total: number };
  bestSellers: { name: string; quantity: number; revenue: number }[];
  categoryData: { name: string; value: number }[];
  paymentData: { name: string; value: number }[];
  revenueData: { label: string; revenue: number; profit: number; orders: number }[];
  transactions: { date: string; receiptTag: string; orderType: string; description: string; quantity: number; value: number }[];
}

function buildPeriodPayload(
  orders: OrderRow[], inventory: InventoryRow[], menuItems: MenuItemRow[],
  fixedCosts: FixedCosts, ivaRate: number, year: number, month: number | null, days: number,
): PeriodPayload {
  const paid = orders.filter(o => o.paid);
  const expensesTotal = fixedCosts.recurringMonthly * (days / 30) + fixedCosts.oneTime;
  const stats = computeStats(paid, inventory, fixedCosts, ivaRate, days);

  const bestSellersMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const categoryMap = new Map<string, number>();
  const paymentMap = new Map<string, number>();
  const revenueMap = new Map<string, { revenue: number; orders: number; profit: number }>();
  const paymentLabels: Record<string, string> = { cash: 'Dinheiro', card: 'Cartão', 'mobile-money': 'M-Pesa' };
  const menuById = new Map(menuItems.map(m => [m.id, m]));

  paid.forEach(o => {
    o.order_items.forEach(item => {
      const id = item.menu_item_id ?? item.name;
      const cur = bestSellersMap.get(id) || { name: item.name, quantity: 0, revenue: 0 };
      bestSellersMap.set(id, { name: item.name, quantity: cur.quantity + item.quantity, revenue: cur.revenue + item.price * item.quantity });

      const cat = (item.menu_item_id && menuById.get(item.menu_item_id)?.category) || 'Outros';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.price * item.quantity);
    });

    const pm = o.payment_method || 'cash';
    const rev = Number(o.total) + Number(o.tip || 0);
    paymentMap.set(pm, (paymentMap.get(pm) || 0) + rev);

    const d = new Date(o.created_at);
    const rk = d.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' });
    const cur = revenueMap.get(rk) || { revenue: 0, orders: 0, profit: 0 };
    let cost = 0;
    o.order_items.forEach(item => {
      inventory.forEach(inv => {
        if (item.menu_item_id && inv.linked_menu_item_ids.includes(item.menu_item_id)) cost += inv.cost_per_unit * inv.usage_per_serving * item.quantity;
      });
    });
    revenueMap.set(rk, { revenue: cur.revenue + rev, orders: cur.orders + 1, profit: cur.profit + (rev - cost) });
  });

  const orderTypeLabel = (o: OrderRow) =>
    o.type === 'dine-in' ? `Mesa ${o.table_number ?? '—'}` : o.type === 'takeaway' ? 'Takeaway' : 'Entrega';
  const transactions = paid
    .flatMap(o => {
      const date = new Date(o.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      const receiptTag = `#${o.id.slice(-4)}`;
      const orderType = orderTypeLabel(o);
      return o.order_items.map(item => ({
        date, receiptTag, orderType, description: item.name,
        quantity: item.quantity, value: item.price * item.quantity, _sortAt: o.created_at,
      }));
    })
    .sort((a, b) => a._sortAt.localeCompare(b._sortAt))
    .map(({ _sortAt: _drop, ...r }) => r);

  return {
    year, monthLabel: month !== null ? MONTHS_PT[month] : undefined,
    stats,
    expenses: { recurringMonthly: fixedCosts.recurringMonthly, oneTime: fixedCosts.oneTime, total: expensesTotal },
    bestSellers: Array.from(bestSellersMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    categoryData: Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value })),
    paymentData: Array.from(paymentMap.entries()).map(([k, v]) => ({ name: paymentLabels[k] || k, value: v })),
    revenueData: Array.from(revenueMap.entries()).map(([label, v]) => ({ label, ...v })),
    transactions,
  };
}

// -- Workbook (porta de src/lib/exportExcel.ts) ------------------------------

function buildWorkbook(p: PeriodPayload): Uint8Array {
  const fmt = (n: number) => Number(n.toFixed(0));
  const wb = XLSX.utils.book_new();
  const periodLabel = p.monthLabel ? `${p.monthLabel} ${p.year}` : String(p.year);

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Relatório Anual', periodLabel], [],
    ['Receita Total', fmt(p.stats.totalRevenue)],
    ['Pedidos Pagos', p.stats.totalOrders],
    ['Ticket Médio', fmt(p.stats.avgTicket)],
    ['Custo de Ingredientes', fmt(p.stats.totalCost)],
    ['Lucro Líquido', fmt(p.stats.profit)],
    ['Margem (%)', Number(p.stats.margin.toFixed(1))],
  ]), 'Resumo');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.revenueData.map(r => ({ Mês: r.label, Receita: fmt(r.revenue), Lucro: fmt(r.profit), Pedidos: r.orders })),
  ), 'Vendas Mensais');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.bestSellers.map(b => ({ Item: b.name, Quantidade: b.quantity, Receita: fmt(b.revenue) })),
  ), 'Mais Vendidos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.categoryData.map(c => ({ Categoria: c.name, Receita: fmt(c.value) })),
  ), 'Categorias');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.paymentData.map(m => ({ Método: m.name, Total: fmt(m.value) })),
  ), 'Pagamentos');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Tipo', 'Valor'],
    ['Despesas Recorrentes', fmt(p.expenses.recurringMonthly)],
    ['Despesas Pontuais', fmt(p.expenses.oneTime)],
    ['Total', fmt(p.expenses.total)],
  ]), 'Despesas e Salários');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
    p.transactions.map(t => ({
      Data: t.date, Recibo: t.receiptTag, Tipo: t.orderType,
      Descrição: t.description, 'Qtd.': t.quantity, Valor: fmt(t.value),
    })),
  ), 'Transações');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

// -- Arquivar um (tenant, ano): resumo + meses com dados, depois apagar -----

async function archiveYear(admin: SupabaseClient, tenantId: string, year: number) {
  const { data: yearDone } = await admin
    .from('archived_reports').select('id').eq('tenant_id', tenantId).eq('year', year).eq('month', 0).eq('status', 'purged').maybeSingle();
  if (yearDone) return { tenantId, year, skipped: 'already-purged' as const };

  const orders = await fetchOrdersForYear(admin, tenantId, year);
  const paidOrders = orders.filter(o => o.paid);
  if (paidOrders.length === 0) return { tenantId, year, skipped: 'no-orders' as const };

  const [{ data: inventory }, { data: menuItems }, { data: settingsRow }] = await Promise.all([
    admin.from('inventory_items').select('linked_menu_item_ids, cost_per_unit, usage_per_serving').eq('tenant_id', tenantId),
    admin.from('menu_items').select('id, category').eq('tenant_id', tenantId),
    admin.from('app_settings').select('data').eq('tenant_id', tenantId).maybeSingle(),
  ]);
  const ivaRate = Number((settingsRow?.data as Record<string, unknown> | null)?.ivaRate ?? 0);
  const asOfYearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const fixedCosts = await fetchFixedCostsAsOf(admin, tenantId, asOfYearEnd);

  const { data: existingRows } = await admin
    .from('archived_reports').select('month').eq('tenant_id', tenantId).eq('year', year);
  const existing = new Set((existingRows ?? []).map(r => r.month as number));

  const periods: { month: number; orders: OrderRow[]; days: number; label: string; path: string }[] = [];
  if (!existing.has(0)) {
    const days = Math.max(1, (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
    periods.push({ month: 0, orders: paidOrders, days, label: `o ano ${year}`, path: `${tenantId}/${year}.xlsx` });
  }
  for (let m = 0; m < 12; m++) {
    if (existing.has(m + 1)) continue;
    const monthOrders = paidOrders.filter(o => new Date(o.created_at).getUTCMonth() === m);
    if (monthOrders.length === 0) continue;
    const days = Math.max(1, (Date.UTC(year, m + 1, 1) - Date.UTC(year, m, 1)) / 86_400_000);
    const mm = String(m + 1).padStart(2, '0');
    periods.push({ month: m + 1, orders: monthOrders, days, label: `${MONTHS_PT[m]} ${year}`, path: `${tenantId}/${year}-${mm}.xlsx` });
  }

  for (const period of periods) {
    const payload = buildPeriodPayload(period.orders, (inventory ?? []) as InventoryRow[], (menuItems ?? []) as MenuItemRow[], fixedCosts, ivaRate, year, period.month === 0 ? null : period.month - 1, period.days);
    const bytes = buildWorkbook(payload);
    const { error: uploadErr } = await admin.storage.from('archived-reports').upload(period.path, bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false,
    });
    if (uploadErr) throw new Error(`upload ${period.label}: ${uploadErr.message}`);
    const { error: insertErr } = await admin.from('archived_reports').insert({
      tenant_id: tenantId, year, month: period.month, storage_path: period.path,
      status: 'archived', total_revenue: payload.stats.totalRevenue, total_orders: payload.stats.totalOrders,
    });
    if (insertErr) throw new Error(`registar ${period.label}: ${insertErr.message}`);
  }

  // Só a partir daqui — todos os ficheiros devidos confirmados — é seguro apagar.
  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const { count: ordersDeleted, error: ordersErr } = await admin
    .from('orders').delete({ count: 'exact' }).eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end);
  if (ordersErr) throw new Error(`apagar orders: ${ordersErr.message}`);

  const { count: shiftsDeleted, error: shiftsErr } = await admin
    .from('shifts').delete({ count: 'exact' }).eq('tenant_id', tenantId).gte('clock_in', start).lt('clock_in', end);
  if (shiftsErr) throw new Error(`apagar shifts: ${shiftsErr.message}`);

  const { count: alertsDeleted, error: alertsErr } = await admin
    .from('security_alerts').delete({ count: 'exact' }).eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end);
  if (alertsErr) throw new Error(`apagar security_alerts: ${alertsErr.message}`);

  const purgedAt = new Date().toISOString();
  await admin.from('archived_reports').update({ status: 'purged', purged_at: purgedAt }).eq('tenant_id', tenantId).eq('year', year);
  await admin.from('archived_reports').update({
    orders_deleted: ordersDeleted ?? 0, shifts_deleted: shiftsDeleted ?? 0, alerts_deleted: alertsDeleted ?? 0,
  }).eq('tenant_id', tenantId).eq('year', year).eq('month', 0);

  return {
    tenantId, year, archived: periods.length,
    ordersDeleted: ordersDeleted ?? 0, shiftsDeleted: shiftsDeleted ?? 0, alertsDeleted: alertsDeleted ?? 0,
  };
}

// -- HTTP handler -------------------------------------------------------------

const ManualBodySchema = z.object({ tenantId: z.string().uuid(), year: z.number().int().min(2000).max(2100) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;

    if (isCron) {
      const { data: due, error: dueErr } = await admin.rpc('find_due_archive_years');
      if (dueErr) return json({ error: dueErr.message }, 500);
      const batch = ((due ?? []) as { tenant_id: string; year: number }[]).slice(0, MAX_PER_RUN);
      const results = [];
      for (const { tenant_id, year } of batch) {
        try { results.push(await archiveYear(admin, tenant_id, year)); }
        catch (e) { results.push({ tenantId: tenant_id, year, error: e instanceof Error ? e.message : String(e) }); }
      }
      return json({ ok: true, processed: results });
    }

    // Modo manual: exige sessão real de super-admin.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    const { data: superRoles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'superadmin');
    if (!superRoles || superRoles.length === 0) return json({ error: 'Apenas o super-admin pode forçar o arquivamento.' }, 403);

    const parsed = ManualBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const result = await archiveYear(admin, parsed.data.tenantId, parsed.data.year);
    return json(result);
  } catch (e) {
    console.error('archive-old-years error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
