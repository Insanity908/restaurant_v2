// Removes a staff member from a tenant (Funcionários > Remover). Unlike a
// plain client-side delete, this also drops the Supabase Auth user — and
// therefore their login credential (phone/email + password) — once they no
// longer belong to ANY tenant. Without this, "removing" someone left their
// auth.users row (and login) orphaned forever: they could still sign in,
// and their phone/email stayed "taken" if the restaurant ever tried to
// re-add them. Must run with the service role: deleting someone else's auth
// user, and their tenant_members/user_roles rows, is not something the
// client's own RLS-scoped session is allowed to do.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
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
    const { tenantId, userId } = parsed.data;

    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: 'Não pode eliminar a sua própria conta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be an admin (or superadmin) of the target tenant — same
    // authorization rule as creating a staff account.
    const { data: callerRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('tenant_id', tenantId);
    const { data: callerSuperRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'superadmin');
    const isSuper = (callerSuperRoles ?? []).length > 0;
    const isAdmin = isSuper || (callerRoles ?? []).some(r => r.role === 'admin');
    const isManager = (callerRoles ?? []).some(r => r.role === 'manager');
    if (!isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: 'Sem permissão para remover funcionários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The target must actually belong to this tenant — prevents removing a
    // member of a DIFFERENT restaurant by guessing/reusing a user id.
    const { data: membership } = await admin
      .from('tenant_members').select('tenant_id').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Funcionário não pertence a este restaurante' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('user_roles').delete().eq('tenant_id', tenantId).eq('user_id', userId);
    await admin.from('tenant_members').delete().eq('tenant_id', tenantId).eq('user_id', userId);
    await admin.from('staff').delete().eq('tenant_id', tenantId).eq('id', userId);

    // Só apaga a conta de autenticação (e portanto o login) se a pessoa não
    // ficar membro de MAIS NENHUM restaurante — alguém pode trabalhar em
    // várias unidades (multi-restaurante), e remover de uma não pode
    // derrubar o acesso às outras. Superadmins nunca são apagados por aqui.
    const { data: remaining } = await admin
      .from('tenant_members').select('tenant_id').eq('user_id', userId).limit(1);
    const { data: targetSuperRoles } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'superadmin');
    const targetIsSuper = (targetSuperRoles ?? []).length > 0;

    let authDeleted = false;
    if ((remaining ?? []).length === 0 && !targetIsSuper) {
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) console.warn('delete-staff-account: deleteUser failed', delErr.message);
      else authDeleted = true;
    }

    return new Response(JSON.stringify({ ok: true, authDeleted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('delete-staff-account error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
