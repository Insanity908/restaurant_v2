// Provisions a REAL login (Supabase Auth user + profile + tenant membership
// + role) for a staff member created from Funcionários > Novo funcionário.
// Must run with the service role because creating auth users and inserting
// into `tenant_members` / `user_roles` on someone else's behalf is not
// something the client's own RLS-scoped session is allowed to do.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const ASSIGNABLE_ROLES = ['manager', 'cashier', 'waiter', 'kitchen'] as const;

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  role: z.enum(ASSIGNABLE_ROLES),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/i, 'Username: apenas letras, números e _'),
  email: z.string().email(),
  password: z.string().min(8).max(72),
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
    const { tenantId, name, role, username, email, password } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be an admin (or superadmin) of the target tenant. Managers
    // can only invite non-elevated roles (enforced client-side too, but we
    // never trust the client for authorization).
    const { data: callerRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('tenant_id', tenantId);
    const { data: superRoles } = await admin
      .from('user_roles').select('role').eq('user_id', caller.id).eq('role', 'superadmin');
    const isSuper = (superRoles ?? []).length > 0;
    const isAdmin = isSuper || (callerRoles ?? []).some(r => r.role === 'admin');
    const isManager = (callerRoles ?? []).some(r => r.role === 'manager');
    if (!isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: 'Sem permissão para criar funcionários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (isManager && !isAdmin && role === 'manager') {
      return new Response(JSON.stringify({ error: 'Gerentes não podem criar outros gerentes' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Username must be globally unique (case-insensitive).
    const { data: usernameTaken } = await admin
      .from('profiles').select('id').ilike('username', username).limit(1);
    if (usernameTaken && usernameTaken.length > 0) {
      return new Response(JSON.stringify({ error: 'Username já está em uso' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'Falha ao criar conta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const newUserId = created.user.id;

    await admin.from('profiles').update({ name, username }).eq('id', newUserId);
    await admin.from('tenant_members').insert({ tenant_id: tenantId, user_id: newUserId });
    await admin.from('user_roles').insert({ tenant_id: tenantId, user_id: newUserId, role });

    return new Response(JSON.stringify({ ok: true, userId: newUserId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('create-staff-account error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
