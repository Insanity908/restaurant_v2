// Alerta de silêncio para auto-activate-payment (ver migração
// 20260828010000_payment_webhook_heartbeat.sql para o motivo/incidente).
// Só o cron chama isto — nunca um utilizador, não há nada aqui que faça
// sentido invocar manualmente.
//
// Corre a cada 3h (ver `payment-webhook-silence-check` no pg_cron) e
// avisa o superadmin por push quando as DUAS condições se verificam:
//   1. Há mais de SILENCE_THRESHOLD_HOURS sem nenhum pedido a passar a
//      autenticação de auto-activate-payment (system_payment_accounts.
//      last_sms_seen_at) — ou seja, o webhook está mesmo calado, não é só
//      "sem pagamentos a bater certo" (isso já é coberto por D5/
//      payment_sms_log, evento a evento).
//   2. Houve pelo menos uma sessão de checkout criada nesse período de
//      silêncio — sinal de que havia procura real (alguém a tentar pagar)
//      sem nenhuma SMS alguma vez ter chegado. Sem esta segunda condição,
//      um dia genuinamente parado (sem ninguém a comprar) dispararia um
//      alarme falso todos os dias.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SILENCE_THRESHOLD_HOURS = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Mesmo padrão de notifySuperadminFailure em auto-activate-payment/
// index.ts (duplicado de propósito — Edge Functions não importam de
// src/, e cada uma já tinha o seu próprio helper antes desta).
async function notifySuperadmins(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  body: string,
) {
  const { data: supers } = await admin.from('user_roles').select('user_id').eq('role', 'superadmin');
  const superIds = [...new Set((supers ?? []).map(r => r.user_id as string))];
  if (superIds.length === 0) return;

  const { data: subs } = await admin.from('push_subscriptions').select('tenant_id').in('staff_id', superIds);
  const tenantIds = [...new Set((subs ?? []).map(s => s.tenant_id as string))];

  await Promise.all(tenantIds.map(tenantId =>
    fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        staffIds: superIds,
        title: 'Pagamentos automáticos: sem SMS há horas',
        body,
        url: '/superadmin',
        tag: 'payment-webhook-silence',
      }),
    }).catch(e => console.error('notifySuperadmins send-push failed', e))
  ));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: acc, error: accErr } = await admin
      .from('system_payment_accounts').select('last_sms_seen_at').eq('id', 1).maybeSingle();
    if (accErr) return json({ error: accErr.message }, 500);
    if (!acc?.last_sms_seen_at) return json({ ok: true, skipped: 'no-heartbeat-yet' });

    const lastSeen = new Date(acc.last_sms_seen_at as string);
    const hoursSilent = (Date.now() - lastSeen.getTime()) / 3_600_000;
    if (hoursSilent < SILENCE_THRESHOLD_HOURS) return json({ ok: true, hoursSilent });

    const { count, error: countErr } = await admin
      .from('checkout_sessions').select('id', { count: 'exact', head: true })
      .gt('created_at', lastSeen.toISOString());
    if (countErr) return json({ error: countErr.message }, 500);
    if (!count) return json({ ok: true, hoursSilent, skipped: 'no-demand-in-window' });

    await notifySuperadmins(
      admin, supabaseUrl, serviceKey,
      `Nenhuma SMS de pagamento chegou há ${Math.round(hoursSilent)}h, apesar de ${count} sessão(ões) de checkout criada(s) nesse período. Confirma se a app de reencaminhamento de SMS (MacroDroid) ainda está activa no telemóvel.`,
    );
    return json({ ok: true, alerted: true, hoursSilent, count });
  } catch (e) {
    console.error('check-payment-webhook-silence error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
