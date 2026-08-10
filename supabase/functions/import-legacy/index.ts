// One-time import of legacy localStorage data into the tenant's cloud tables.
// Only a tenant admin (or superadmin) may import into a tenant. Import is
// additive and idempotent-ish: rows whose id already exists are skipped.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const Modifier = z.record(z.unknown());

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  data: z.object({
    menuItems: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(200),
      price: z.number().nonnegative(),
      category: z.string().max(100).default('Geral'),
      description: z.string().max(2000).nullish(),
      image: z.string().max(500).nullish(),
      available: z.boolean().default(true),
      modifiers: z.array(Modifier).default([]),
      recipe: z.unknown().nullish(),
    })).max(2000).default([]),
    tables: z.array(z.object({
      id: z.string().optional(),
      number: z.number().int().nonnegative(),
      seats: z.number().int().nonnegative().default(4),
      status: z.enum(['free', 'occupied', 'reserved']).default('free'),
    })).max(500).default([]),
    inventory: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(200),
      unit: z.string().max(40).default('un'),
      currentStock: z.number().default(0),
      minStock: z.number().default(0),
      costPerUnit: z.number().default(0),
      linkedMenuItemIds: z.array(z.string()).default([]),
      usagePerServing: z.number().default(0),
    })).max(2000).default([]),
    customers: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(200),
      phone: z.string().max(40).default(''),
      email: z.string().max(200).nullish(),
      nuit: z.string().max(40).nullish(),
      birthday: z.string().max(40).nullish(),
      notes: z.string().max(2000).nullish(),
      pointsAdjustment: z.number().default(0),
    })).max(5000).default([]),
    staff: z.array(z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(200),
      role: z.enum(['admin', 'manager', 'waiter', 'cashier', 'kitchen']).default('waiter'),
    })).max(500).default([]),
  }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (id?: string) => (id && UUID_RE.test(id) ? id : crypto.randomUUID());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
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

    // Authorization: superadmin or admin of this tenant.
    const { data: roles } = await admin.from('user_roles').select('role, tenant_id').eq('user_id', user.id);
    const allowed = (roles ?? []).some(r =>
      r.role === 'superadmin' || (r.tenant_id === tenantId && (r.role === 'admin' || r.role === 'manager')));
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const imported: Record<string, number> = {};

    // Skip anything already present so re-running is safe.
    const existingIds = async (table: string) => {
      const { data: rows } = await admin.from(table).select('id').eq('tenant_id', tenantId);
      return new Set((rows ?? []).map(r => r.id as string));
    };

    if (data.menuItems.length) {
      const seen = await existingIds('menu_items');
      const rows = data.menuItems.map(m => ({
        id: idOf(m.id), tenant_id: tenantId, name: m.name, price: m.price, category: m.category,
        description: m.description ?? null, image_path: m.image ?? null, available: m.available,
        modifiers: m.modifiers ?? [], recipe: m.recipe ?? null,
      })).filter(r => !seen.has(r.id));
      if (rows.length) {
        const { error } = await admin.from('menu_items').insert(rows);
        if (error) throw error;
      }
      imported.menuItems = rows.length;
    }

    if (data.tables.length) {
      const { data: existingTables } = await admin.from('restaurant_tables').select('number').eq('tenant_id', tenantId);
      const numbers = new Set((existingTables ?? []).map(t => t.number));
      const rows = data.tables
        .filter(t => !numbers.has(t.number))
        .map(t => ({ id: idOf(t.id), tenant_id: tenantId, number: t.number, seats: t.seats, status: t.status }));
      if (rows.length) {
        const { error } = await admin.from('restaurant_tables').insert(rows);
        if (error) throw error;
      }
      imported.tables = rows.length;
    }

    if (data.inventory.length) {
      const seen = await existingIds('inventory_items');
      const rows = data.inventory.map(i => ({
        id: idOf(i.id), tenant_id: tenantId, name: i.name, unit: i.unit,
        current_stock: i.currentStock, min_stock: i.minStock, cost_per_unit: i.costPerUnit,
        linked_menu_item_ids: i.linkedMenuItemIds, usage_per_serving: i.usagePerServing,
      })).filter(r => !seen.has(r.id));
      if (rows.length) {
        const { error } = await admin.from('inventory_items').insert(rows);
        if (error) throw error;
      }
      imported.inventory = rows.length;
    }

    if (data.customers.length) {
      const { data: existingCustomers } = await admin.from('customers').select('id, phone').eq('tenant_id', tenantId);
      const seen = new Set((existingCustomers ?? []).map(c => c.id as string));
      const phones = new Set((existingCustomers ?? []).map(c => (c.phone ?? '').trim()).filter(Boolean));
      const rows = data.customers
        .map(c => ({
          id: idOf(c.id), tenant_id: tenantId, name: c.name, phone: c.phone ?? '',
          email: c.email ?? null, nuit: c.nuit ?? null, birthday: c.birthday ?? null,
          notes: c.notes ?? null, points_adjustment: Math.round(c.pointsAdjustment ?? 0),
        }))
        .filter(r => !seen.has(r.id) && !(r.phone && phones.has(r.phone.trim())));
      if (rows.length) {
        const { error } = await admin.from('customers').insert(rows);
        if (error) throw error;
      }
      imported.customers = rows.length;
    }

    if (data.staff.length) {
      const { data: existingStaff } = await admin.from('staff').select('id, name').eq('tenant_id', tenantId);
      const seen = new Set((existingStaff ?? []).map(s => s.id as string));
      const names = new Set((existingStaff ?? []).map(s => (s.name ?? '').toLowerCase()));
      const rows = data.staff
        .map(s => ({ id: idOf(s.id), tenant_id: tenantId, name: s.name, role: s.role }))
        .filter(r => !seen.has(r.id) && !names.has(r.name.toLowerCase()));
      if (rows.length) {
        const { error } = await admin.from('staff').insert(rows);
        if (error) throw error;
      }
      imported.staff = rows.length;
    }

    return json({ ok: true, imported });
  } catch (e) {
    console.error('import-legacy error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
