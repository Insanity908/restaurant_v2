// Creates a tenant + admin membership + trial subscription for the calling user.
// Called by the client right after signUp() succeeds.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  restaurantName: z.string().min(1).max(120),
  ownerName: z.string().min(1).max(120).optional(),
  ownerPhone: z.string().max(40).optional(),
  // Quando true, cria sempre um NOVO tenant mesmo que o utilizador já seja
  // membro de outro (fluxo "Adicionar outra unidade"). Quando false/omitido,
  // mantém o comportamento original de signup (idempotente).
  additional: z.boolean().optional(),
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

    // Validate the JWT and get user id.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { restaurantName, ownerName, ownerPhone, additional } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // If the user is already a tenant member somewhere, don't auto-create a new
    // one — UNLESS this call is explicitly asking for an additional unit
    // (e.g. "Adicionar outra unidade" in Onboarding/Sidebar).
    if (!additional) {
      const { data: existing } = await admin
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1);
      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ ok: true, tenantId: existing[0].tenant_id, existed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 1) tenant
    const licenseKey = `lic_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .insert({
        name: restaurantName.trim(),
        owner_email: user.email ?? '',
        owner_phone: ownerPhone?.trim() ?? null,
        license_key: licenseKey,
      })
      .select()
      .single();
    if (tenantErr || !tenant) throw tenantErr ?? new Error('Tenant creation failed');

    // 2) profile fields (in case trigger already ran, patch phone/name).
    // Also default a username (email local-part) so the owner can log in
    // with either email or username; only set it the first time (never
    // overwrite a username the user may have already chosen).
    const { data: existingProfile } = await admin
      .from('profiles').select('username').eq('id', user.id).maybeSingle();
    const profilePatch: Record<string, unknown> = {
      name: ownerName?.trim() || user.user_metadata?.name || user.email,
      phone: ownerPhone?.trim() ?? null,
    };
    if (!existingProfile?.username && user.email) {
      const base = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
      const { data: taken } = await admin
        .from('profiles').select('id').ilike('username', base).limit(1);
      profilePatch.username = (taken && taken.length > 0)
        ? `${base}${Math.random().toString(36).slice(2, 5)}`
        : base;
    }
    await admin.from('profiles').update(profilePatch).eq('id', user.id);

    // 3) membership + admin role
    const { error: memberErr } = await admin.from('tenant_members').insert({ tenant_id: tenant.id, user_id: user.id });
    if (memberErr) throw memberErr;
    const { error: roleErr } = await admin.from('user_roles').insert({ tenant_id: tenant.id, user_id: user.id, role: 'admin' });
    if (roleErr) throw roleErr;

    // 4) 7-day trial subscription. `plan` só aceita monthly/quarterly/
    // semiannual/annual (enum billing_plan) — "trial" nunca foi um valor
    // válido, e como o erro não era verificado, isto falhava sempre e em
    // silêncio: todo restaurante novo ficava sem nenhuma linha de
    // subscrição, mostrando "0 dias" até subscription-status (a única
    // função que já usava plan: null) a recriar mais tarde.
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { error: subErr } = await admin.from('subscriptions').insert({
      tenant_id: tenant.id,
      plan: null,
      status: 'trial',
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
      blocked_by_admin: false,
    });
    if (subErr) throw subErr;

    // 5) seed app_settings so the brand name shown across the UI (sidebar,
    // Settings > Marca, receipts) matches what was typed at signup, instead
    // of the placeholder default.
    await admin.from('app_settings').upsert(
      { tenant_id: tenant.id, data: { brandName: restaurantName.trim() } },
      { onConflict: 'tenant_id' },
    );

    return new Response(JSON.stringify({ ok: true, tenantId: tenant.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('bootstrap-tenant error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
