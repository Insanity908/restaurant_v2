// Apaga dados operacionais com mais de um ano (Arquivo de Dados > "Apagar
// dados antigos") para libertar espaço de armazenamento. Corre com o service
// role porque bulk-delete de um ano de pedidos via cliente (fila de sync
// offline em outbox.ts) seria lento e frágil em ligações instáveis — aqui é
// uma única chamada privilegiada. O cutoff é sempre recalculado no servidor
// (nunca confia no valor vindo do cliente) para que um bug ou payload
// malicioso nunca consiga apagar dados com menos de um ano.
//
// Âmbito: orders (cascata automática para order_items/order_events via FK
// "on delete cascade"), shifts, security_alerts — as únicas tabelas
// tenant-scoped que crescem sem limite por transacção/turno/evento.
// NUNCA apaga expenses/expense_amount_history/staff_salaries (baixo volume,
// histórico necessário para reconstruir relatórios de períodos passados —
// ver expenseStore.remove() em src/lib/expenses.ts) nem customers
// (registo de fidelidade, não um log por-transacção).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  cutoffDate: z.string().datetime().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const caller = callerData.user;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { tenantId, cutoffDate } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // Só admin do tenant (mais restrito que delete-staff-account, que também
    // aceita manager — isto é mais destrutivo) — ou superadmin.
    const { data: callerRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('tenant_id', tenantId);
    const { data: callerSuperRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'superadmin');
    const isSuper = (callerSuperRoles ?? []).length > 0;
    const isAdmin = isSuper || (callerRoles ?? []).some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Sem permissão para apagar dados deste restaurante' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cutoff nunca mais recente que "hoje - 1 ano", independentemente do que
    // o cliente pediu — usa o mais antigo entre os dois.
    const oneYearAgo = new Date();
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
    const requested = cutoffDate ? new Date(cutoffDate) : oneYearAgo;
    const cutoff = requested < oneYearAgo ? requested : oneYearAgo;
    const cutoffIso = cutoff.toISOString();

    const { count: ordersDeleted, error: ordersErr } = await admin
      .from('orders').delete({ count: 'exact' })
      .eq('tenant_id', tenantId).lt('created_at', cutoffIso);
    if (ordersErr) throw ordersErr;

    const { count: shiftsDeleted, error: shiftsErr } = await admin
      .from('shifts').delete({ count: 'exact' })
      .eq('tenant_id', tenantId).lt('clock_in', cutoffIso);
    if (shiftsErr) throw shiftsErr;

    const { count: alertsDeleted, error: alertsErr } = await admin
      .from('security_alerts').delete({ count: 'exact' })
      .eq('tenant_id', tenantId).lt('created_at', cutoffIso);
    if (alertsErr) throw alertsErr;

    return new Response(JSON.stringify({
      ok: true,
      cutoff: cutoffIso,
      ordersDeleted: ordersDeleted ?? 0,
      shiftsDeleted: shiftsDeleted ?? 0,
      alertsDeleted: alertsDeleted ?? 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('purge-old-data error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
