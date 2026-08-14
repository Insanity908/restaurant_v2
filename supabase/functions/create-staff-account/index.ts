// Provisions a REAL login (Supabase Auth user + profile + tenant membership
// + role) for a staff member created from Funcionários > Novo funcionário.
// Must run with the service role because creating auth users and inserting
// into `tenant_members` / `user_roles` on someone else's behalf is not
// something the client's own RLS-scoped session is allowed to do.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const ASSIGNABLE_ROLES = ['manager', 'cashier', 'waiter', 'kitchen'] as const;

// Supabase Auth exige sempre um email OU um telefone reais para autenticar
// — por isso é isso que é obrigatório (um dos dois), nunca o username, que
// é só um atalho de login opcional e independente (nunca derivado nem do
// email nem do telefone, e vice-versa).
const BodySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(60),
  role: z.enum(ASSIGNABLE_ROLES),
  username: z.string().max(30).regex(/^[a-z0-9_]*$/i, 'Username: apenas letras, números e _').optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  password: z.string().min(8).max(72),
}).refine(d => (d.email && d.email.trim()) || (d.phone && d.phone.trim()), {
  message: 'Indique um email ou um telefone', path: ['email'],
}).refine(d => !d.username || d.username.trim().length === 0 || d.username.trim().length >= 3, {
  message: 'Username deve ter 3 a 30 caracteres', path: ['username'],
});

/** Normaliza para E.164. Aceita "8X XXX XXXX" (assume Moçambique, +258),
 * "+258 8X XXX XXXX", ou qualquer número já internacional com "+". */
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 9 && /^8[2-7]/.test(digits)) return `+258${digits}`;
  if (digits.startsWith('258') && digits.length === 12) return `+${digits}`;
  if (trimmed.startsWith('+') && digits.length >= 8) return `+${digits}`;
  return null;
}

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
    const { tenantId, name, role, password } = parsed.data;
    const rawUsername = (parsed.data.username ?? '').trim();
    const rawEmail = (parsed.data.email ?? '').trim();
    const rawPhone = (parsed.data.phone ?? '').trim();

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

    // Username continua totalmente opcional e independente — nunca é
    // exigido, nunca é derivado de nada, e nada é derivado dele. Só é
    // verificado se foi mesmo escolhido.
    const username = rawUsername;
    if (username) {
      const { data: usernameTaken } = await admin
        .from('profiles').select('id').ilike('username', username).limit(1);
      if (usernameTaken && usernameTaken.length > 0) {
        return new Response(JSON.stringify({ error: 'Username já está em uso' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let phone: string | null = null;
    if (rawPhone) {
      phone = toE164(rawPhone);
      if (!phone) {
        return new Response(JSON.stringify({ error: 'Telefone inválido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Pelo menos um de email/phone está garantido pelo .refine() do schema
    // — cria a conta com o(s) que houver (as duas podem coexistir).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      ...(rawEmail ? { email: rawEmail, email_confirm: true } : {}),
      ...(phone ? { phone, phone_confirm: true } : {}),
      password,
      user_metadata: { name },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'Falha ao criar conta' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const newUserId = created.user.id;

    const profilePatch: Record<string, unknown> = { name };
    if (username) profilePatch.username = username;
    if (phone) profilePatch.phone = phone;
    await admin.from('profiles').update(profilePatch).eq('id', newUserId);
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
