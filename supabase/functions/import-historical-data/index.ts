// Importação de dados anteriores ao uso do sistema, via Excel (ver
// src/lib/importExcel.ts para o template/parsing no browser). Diferente de
// import-legacy (que migra localStorage de ANTES do multi-tenant/cloud
// deste MESMO dispositivo): aqui o ficheiro pode vir de outro sistema, de
// uma folha de cálculo, ou de registos em papel — os dados nunca têm um id
// próprio, por isso toda a deduplicação é por chave natural (mesmo padrão
// já usado em import-legacy, incluindo o mesmo erro a evitar: nunca
// deduplicar só por id gerado agora, ver o comentário lá).
//
// "sales" (histórico de vendas) é o caso especial: uma linha por ITEM
// vendido (não por pedido) — mesmo nível de detalhe da folha "Transações"
// exportada por exportYearReportExcel (Data/Recibo/Tipo/Descrição/Qtd/
// Valor), de propósito, para um ficheiro exportado por este sistema também
// poder ser reimportado sem transformação. Linhas com o mesmo Data+Recibo
// juntam-se num único pedido (várias linhas de item); sem Recibo, cada
// linha vira o seu próprio pedido de 1 item.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  data: z.object({
    menuItems: z.array(z.object({
      name: z.string().min(1).max(200),
      price: z.number().nonnegative(),
      category: z.string().max(100).default('Geral'),
      description: z.string().max(2000).nullish(),
      available: z.boolean().default(true),
    })).max(5000).default([]),
    customers: z.array(z.object({
      name: z.string().min(1).max(200),
      phone: z.string().max(40).default(''),
      email: z.string().max(200).nullish(),
      nuit: z.string().max(40).nullish(),
      birthday: z.string().max(40).nullish(),
      notes: z.string().max(2000).nullish(),
      pointsAdjustment: z.number().default(0),
    })).max(10000).default([]),
    inventory: z.array(z.object({
      name: z.string().min(1).max(200),
      unit: z.string().max(40).default('un'),
      currentStock: z.number().default(0),
      minStock: z.number().default(0),
      costPerUnit: z.number().default(0),
    })).max(5000).default([]),
    sales: z.array(z.object({
      date: z.string().min(1).max(40),
      receipt: z.string().max(100).nullish(),
      type: z.string().max(40).nullish(),
      description: z.string().min(1).max(300),
      quantity: z.number().positive().default(1),
      value: z.number().nonnegative(),
    })).max(50000).default([]),
  }),
});

function mapOrderType(raw?: string | null): 'dine-in' | 'takeaway' | 'delivery' {
  const t = (raw ?? '').trim().toLowerCase();
  if (t.includes('entrega') || t.includes('delivery')) return 'delivery';
  if (t.includes('mesa') || t.includes('dine')) return 'dine-in';
  return 'takeaway';
}

/** Data da folha pode vir em vários formatos (Excel devolve string ou
 *  número de série) — já chega tratada como string ISO/"DD/MM/AAAA" pelo
 *  parsing no browser (src/lib/importExcel.ts); aqui só validamos que dá
 *  para construir uma Date válida, sem tentar adivinhar mais formatos. */
function parseHistoricalDate(raw: string): Date | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);
    const user = userData.user;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { tenantId, data } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorization: superadmin or admin/manager of this tenant — mesmo
    // critério de import-legacy.
    const { data: roles } = await admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id);
    const allowed = (roles ?? []).some(r =>
      r.role === 'superadmin' || (r.tenant_id === tenantId && (r.role === 'admin' || r.role === 'manager')));
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const imported: Record<string, number> = {};
    const errors: string[] = [];

    if (data.menuItems.length) {
      const { data: existing } = await admin.from('menu_items').select('name').eq('tenant_id', tenantId);
      const names = new Set((existing ?? []).map(r => (r.name ?? '').trim().toLowerCase()));
      const rows = data.menuItems
        .filter(m => !names.has(m.name.trim().toLowerCase()))
        .map(m => ({
          tenant_id: tenantId, name: m.name, price: m.price, category: m.category,
          description: m.description ?? null, available: m.available,
        }));
      if (rows.length) {
        const { error } = await admin.from('menu_items').insert(rows);
        if (error) throw error;
      }
      imported.menuItems = rows.length;
    }

    if (data.inventory.length) {
      const { data: existing } = await admin.from('inventory_items').select('name').eq('tenant_id', tenantId);
      const names = new Set((existing ?? []).map(r => (r.name ?? '').trim().toLowerCase()));
      const rows = data.inventory
        .filter(i => !names.has(i.name.trim().toLowerCase()))
        .map(i => ({
          tenant_id: tenantId, name: i.name, unit: i.unit,
          current_stock: i.currentStock, min_stock: i.minStock, cost_per_unit: i.costPerUnit,
        }));
      if (rows.length) {
        const { error } = await admin.from('inventory_items').insert(rows);
        if (error) throw error;
      }
      imported.inventory = rows.length;
    }

    if (data.customers.length) {
      const { data: existing } = await admin.from('customers').select('phone').eq('tenant_id', tenantId);
      const phones = new Set((existing ?? []).map(c => (c.phone ?? '').trim()).filter(Boolean));
      const rows = data.customers
        .filter(c => !(c.phone && phones.has(c.phone.trim())))
        .map(c => ({
          tenant_id: tenantId, name: c.name, phone: c.phone ?? '',
          email: c.email ?? null, nuit: c.nuit ?? null, birthday: c.birthday ?? null,
          notes: c.notes ?? null, points_adjustment: Math.round(c.pointsAdjustment ?? 0),
        }));
      if (rows.length) {
        const { error } = await admin.from('customers').insert(rows);
        if (error) throw error;
      }
      imported.customers = rows.length;
    }

    if (data.sales.length) {
      // Agrupa por Data+Recibo — linhas sem recibo nunca se juntam a mais
      // nenhuma (índice próprio na chave), cada uma vira o seu pedido.
      type Group = { key: string; date: Date; type: string | null; lines: typeof data.sales };
      const groups = new Map<string, Group>();
      data.sales.forEach((row, idx) => {
        const d = parseHistoricalDate(row.date);
        if (!d) { errors.push(`Vendas linha ${idx + 2}: data inválida "${row.date}"`); return; }
        const key = row.receipt?.trim() ? `hist|${row.date}|r:${row.receipt.trim()}` : `hist|${row.date}|i:${idx}`;
        const g = groups.get(key) ?? { key, date: d, type: row.type ?? null, lines: [] };
        g.lines.push(row);
        groups.set(key, g);
      });

      const { data: existingOrders } = await admin.from('orders')
        .select('idempotency_key').eq('tenant_id', tenantId).not('idempotency_key', 'is', null);
      const existingKeys = new Set((existingOrders ?? []).map(o => o.idempotency_key as string));

      const newGroups = [...groups.values()].filter(g => !existingKeys.has(g.key));
      const orderRows = newGroups.map(g => ({
        tenant_id: tenantId,
        type: mapOrderType(g.type),
        status: 'completed' as const,
        paid: true,
        total: g.lines.reduce((s, l) => s + l.value, 0),
        created_at: g.date.toISOString(),
        updated_at: g.date.toISOString(),
        closed_at: g.date.toISOString(),
        created_by: { source: 'historical_import' },
        idempotency_key: g.key,
      }));

      if (orderRows.length) {
        const { data: insertedOrders, error } = await admin.from('orders').insert(orderRows)
          .select('id, idempotency_key');
        if (error) throw error;

        const orderIdByKey = new Map((insertedOrders ?? []).map(o => [o.idempotency_key as string, o.id as string]));
        const itemRows = newGroups.flatMap(g => {
          const orderId = orderIdByKey.get(g.key);
          if (!orderId) return [];
          return g.lines.map(l => ({
            order_id: orderId,
            name: l.description,
            quantity: Math.round(l.quantity) || 1,
            price: l.value / (Math.round(l.quantity) || 1),
            status: 'served' as const,
          }));
        });
        if (itemRows.length) {
          const { error: itemsError } = await admin.from('order_items').insert(itemRows);
          if (itemsError) throw itemsError;
        }
      }
      imported.sales = orderRows.length;
    }

    return json({ ok: true, imported, errors });
  } catch (e) {
    console.error('import-historical-data error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
