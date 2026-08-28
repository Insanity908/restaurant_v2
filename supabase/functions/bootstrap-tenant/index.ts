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

    // Qualquer nível pode adicionar mais restaurantes (sem restrição) — se a
    // conta já tiver outro restaurante no Profissional, esse novo restaurante
    // tem 20% de desconto na subscrição (ver MULTI_RESTAURANT_DISCOUNT em
    // src/lib/billing.ts — aplicado na exibição do preço em /pricing e /billing
    // e mencionado na mensagem de WhatsApp; a activação continua manual, por
    // isso não há nada a impor aqui no momento da criação).

    // 1) tenant — verificação "já tem tenant?" + criação feitas ATOMICAMENTE
    // dentro de bootstrap_tenant_slot (migração 20260829010000), com um
    // pg_advisory_xact_lock por utilizador. Antes disto eram dois passos
    // PostgREST separados (SELECT aqui, depois INSERT), cada um a sua
    // própria transacção — pedidos quase simultâneos (duplo-toque, ligação
    // instável) passavam ambos a verificação antes de qualquer um confirmar
    // o INSERT, criando tenants duplicados (aconteceu de verdade em
    // produção — ver comentário na migração).
    const licenseKey = `lic_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const { data: slotRows, error: slotErr } = await admin.rpc('bootstrap_tenant_slot', {
      p_user_id: user.id,
      p_name: restaurantName.trim(),
      p_owner_email: user.email ?? '',
      p_owner_phone: ownerPhone?.trim() ?? null,
      p_license_key: licenseKey,
      p_additional: additional ?? false,
    });
    if (slotErr) throw slotErr;
    const slot = (slotRows as { out_tenant_id: string; out_existed: boolean }[] | null)?.[0];
    if (!slot) throw new Error('bootstrap_tenant_slot returned no row');
    if (slot.out_existed) {
      return new Response(JSON.stringify({ ok: true, tenantId: slot.out_tenant_id, existed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tenant = { id: slot.out_tenant_id };

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

    // 3) admin role — a membership em tenant_members já foi criada dentro
    // de bootstrap_tenant_slot (passo 1 acima), na mesma transacção que
    // resolve a corrida; inserir aqui outra vez colidiria com a PK
    // (tenant_id, user_id).
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
    // Erros do supabase-js (ex. violação de constraint) são objectos
    // PostgrestError, não `instanceof Error` — sem isto, a resposta e os
    // logs mostravam sempre "Unknown error", escondendo a causa real.
    const message = e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
