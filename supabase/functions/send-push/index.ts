// A.6 (spec-push-notificacoes-permissoes.md): envia notificações Web Push
// a um conjunto de funcionários de um tenant.
//
// Três formas de invocar:
//  - Modo trigger (Postgres, via pg_net): cabeçalho `x-push-trigger-secret`
//    a bater certo com a variável de ambiente PUSH_TRIGGER_SECRET — usado
//    pelos gatilhos de A.7 (`notify_push_new_order`/`notify_push_order_ready`
//    em supabase/migrations). Mesmo padrão de `archive-old-years`/
//    `x-cron-secret`. `staffIds` é usado tal como recebido (o gatilho já
//    resolveu a audiência certa via `staff_with_permission`).
//  - Modo confiança (server-to-server): cabeçalho `Authorization: Bearer
//    <SUPABASE_SERVICE_ROLE_KEY>` — para outras Edge Functions chamarem
//    directamente. `staffIds` também usado tal como recebido.
//  - Modo cliente (ex.: admin a testar "enviar notificação de teste"): JWT
//    normal de utilizador autenticado. `tenantId` tem de corresponder a um
//    tenant do chamador (ou o chamador ser superadmin), e `staffIds` é
//    sempre filtrado para membros desse tenant — nunca aceita a lista tal
//    como veio do cliente.
//
// Nunca deve ser chamável livremente pelo browser de um funcionário comum
// com `staffIds` arbitrários de outros tenants.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import webpush from 'npm:web-push@3';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  staffIds: z.array(z.string().uuid()).min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(500),
  url: z.string().max(300).optional(),
  tag: z.string().max(100).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;
    const triggerSecret = Deno.env.get('PUSH_TRIGGER_SECRET');

    const isTrustedTrigger = !!triggerSecret && req.headers.get('x-push-trigger-secret') === triggerSecret;

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!isTrustedTrigger && !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { tenantId, title, body, url, tag } = parsed.data;
    let staffIds = parsed.data.staffIds;

    const admin = createClient(supabaseUrl, serviceKey);
    const isTrustedCaller = isTrustedTrigger || token === serviceKey;

    if (!isTrustedCaller) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);
      const userId = userData.user.id;

      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId);
      const isSuper = (roles ?? []).some(r => r.role === 'superadmin');
      if (!isSuper) {
        const { data: member } = await admin
          .from('tenant_members').select('tenant_id')
          .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
        if (!member) return json({ error: 'Sem acesso a este restaurante.' }, 403);
      }

      const { data: members } = await admin.from('tenant_members').select('user_id').eq('tenant_id', tenantId);
      const allowedIds = new Set((members ?? []).map(m => m.user_id as string));
      staffIds = staffIds.filter(id => allowedIds.has(id));
      if (staffIds.length === 0) return json({ error: 'Nenhum destinatário válido.' }, 400);
    }

    const { data: subs, error: subsErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('tenant_id', tenantId)
      .in('staff_id', staffIds);
    if (subsErr) return json({ error: subsErr.message }, 400);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const payload = JSON.stringify({ title, body, url: url ?? '/', tag });

    let sent = 0;
    let removed = 0;
    const errors: string[] = [];

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
        );
        sent++;
      } catch (e) {
        // 404/410 = endpoint expirado (comportamento padrão do protocolo Web
        // Push) — limpa a subscrição morta em vez de a tentar de novo.
        const statusCode = (e as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          removed++;
        } else {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }

    return json({ total: (subs ?? []).length, sent, removed, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error('send-push error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
