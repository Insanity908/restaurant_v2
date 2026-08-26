// Secção 4 (docs/spec-automacao-confirmacao-pagamentos.md): recebe o texto
// da SMS de confirmação de pagamento (via webhook da app de
// reencaminhamento SMS no telemóvel do superadmin — D2, Opção B),
// extrai os campos por regex (4.2), corresponde a uma sessão de checkout
// pendente (4.3) e activa o plano (4.4) numa única operação atómica feita
// em SQL (match_and_activate_checkout_session, ver migração
// 20260826140000). Só depois disso envia o access_code por email (D7,
// Resend). Quando não há correspondência confiante, regista a tentativa
// (D5/4.5) e notifica o superadmin por push.
//
// Autenticação: só o cabeçalho `x-payment-webhook-secret` (não há sessão
// de utilizador — quem chama é a app de reencaminhamento, não um browser).
// Mesmo padrão de `archive-old-years`/`send-push` (x-cron-secret/
// x-push-trigger-secret).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Secção 2.1: 8 planos a preço cheio + 4 variantes com desconto (só
// Profissional). Estes são os códigos EXACTOS que o superadmin usa como
// "Conteudo" ao gerar cada um dos 12 QR na app do e-Mola (D1) — mudar aqui
// sem avisá-lo primeiro parte a correspondência em produção.
const PLAN_CODE_TO_PLAN: Record<string, string> = {
  'PRO-MENSAL': 'monthly',
  'PRO-MENSAL-DESC': 'monthly',
  'PRO-TRIMESTRAL': 'quarterly',
  'PRO-TRIMESTRAL-DESC': 'quarterly',
  'PRO-SEMESTRAL': 'semiannual',
  'PRO-SEMESTRAL-DESC': 'semiannual',
  'PRO-ANUAL': 'annual',
  'PRO-ANUAL-DESC': 'annual',
  'BASICO-MENSAL': 'basic-monthly',
  'BASICO-TRIMESTRAL': 'basic-quarterly',
  'BASICO-SEMESTRAL': 'basic-semiannual',
  'BASICO-ANUAL': 'basic-annual',
};

// Formato real observado (Secção 0):
//   "ID Trans: PP260821.2115.C86954. Recebeu 40.00MT de 878241021, sandra
//   maria menzissane hibrantes as 21:15:58 21/08/2026. Conteudo:
//   Profissional. O seu novo saldo e de 47.00MT."
const SMS_RE =
  /ID\s*Trans:\s*(?<transactionId>.+?)\.\s*Recebeu\s*(?<amount>[\d.,]+)\s*MT\s*de\s*(?<payerPhone>\d+),\s*(?<payerName>.+?)\s*as\s*(?<time>\d{2}:\d{2}:\d{2})\s*(?<date>\d{2}\/\d{2}\/\d{4})\.\s*Conteudo:\s*(?<planCode>.+?)\.\s*O seu novo saldo/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Aceita tanto JSON (a maioria das apps de reencaminhamento, ex.
// MacroDroid, deixa escolher o nome do campo) como texto puro no corpo.
async function extractSmsText(req: Request): Promise<string | null> {
  const raw = await req.text();
  if (!raw.trim()) return null;
  try {
    const body = JSON.parse(raw);
    for (const key of ['text', 'message', 'body', 'sms', 'Text', 'Message', 'Body']) {
      const value = body?.[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  } catch {
    return raw.trim();
  }
}

async function logFailure(
  admin: ReturnType<typeof createClient>,
  reason: 'unparseable' | 'unknown_plan' | 'no_match',
  rawText: string,
  extracted: Record<string, unknown> | null,
) {
  const { error } = await admin.from('checkout_match_failures').insert({ reason, raw_text: rawText, extracted });
  if (error) console.error('logFailure insert failed', error);
}

// Melhor esforço: nunca deixa uma falha aqui derrubar a resposta do
// webhook. O registo em checkout_match_failures (logFailure) já é a fonte
// de verdade para revisão manual — isto é só o alerta activo extra (D5).
async function notifySuperadminFailure(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  body: string,
) {
  try {
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
          title: 'Pagamento não correspondido',
          body,
          url: '/superadmin',
          tag: 'payment-match-failure',
        }),
      }).catch(e => console.error('notifySuperadminFailure send-push failed', e))
    ));
  } catch (e) {
    console.error('notifySuperadminFailure failed', e);
  }
}

async function sendAccessCodeEmail(email: string, accessCode: string, planLabel: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')!;
  const from = Deno.env.get('RESEND_FROM_EMAIL')!;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'O seu código de acesso',
      html:
        `<p>O pagamento do plano <strong>${planLabel}</strong> foi confirmado.</p>` +
        `<p>Introduza este código na app para confirmar e entrar:</p>` +
        `<p style="font-size:24px;font-weight:bold;letter-spacing:2px">${accessCode}</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const webhookSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
    if (!webhookSecret || req.headers.get('x-payment-webhook-secret') !== webhookSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const text = await extractSmsText(req);
    if (!text) return json({ error: 'Empty body' }, 400);

    const match = SMS_RE.exec(text);
    if (!match?.groups) {
      await logFailure(admin, 'unparseable', text, null);
      await notifySuperadminFailure(admin, supabaseUrl, serviceKey, 'SMS recebida não corresponde ao formato esperado — ver registo para rever à mão.');
      return json({ matched: false, reason: 'unparseable' });
    }

    const { transactionId, payerPhone } = match.groups;
    const planCode = match.groups.planCode.trim().toUpperCase();
    const amount = parseFloat(match.groups.amount.replace(',', '.'));
    const plan = PLAN_CODE_TO_PLAN[planCode];
    const extracted = { transactionId: transactionId.trim(), amount, planCode, payerPhone };

    if (!plan || !Number.isFinite(amount)) {
      await logFailure(admin, 'unknown_plan', text, extracted);
      await notifySuperadminFailure(admin, supabaseUrl, serviceKey, `Plano não reconhecido no conteúdo da SMS: "${planCode}".`);
      return json({ matched: false, reason: 'unknown_plan' });
    }

    const { data: rows, error } = await admin.rpc('match_and_activate_checkout_session', {
      p_plan: plan,
      p_amount: amount,
      p_transaction_id: transactionId.trim(),
    });
    if (error) {
      console.error('match_and_activate_checkout_session error', error);
      return json({ error: error.message }, 500);
    }

    const result = rows?.[0] as
      | { out_session_id: string; out_tenant_id: string; out_contact_email: string; out_access_code: string }
      | undefined;
    if (!result) {
      await logFailure(admin, 'no_match', text, extracted);
      await notifySuperadminFailure(
        admin, supabaseUrl, serviceKey,
        `Sem sessão pendente única para ${planCode} (${amount} MT) — pode ser 0 ou mais do que 1 candidata.`,
      );
      return json({ matched: false, reason: 'no_match' });
    }

    const { data: planRow } = await admin.from('billing_plans').select('label').eq('id', plan).maybeSingle();
    try {
      await sendAccessCodeEmail(result.out_contact_email, result.out_access_code, planRow?.label ?? plan);
    } catch (e) {
      // A activação (4.4) já aconteceu e não se desfaz por causa disto — só
      // o envio falhou. O cliente pode pedir reenvio (D4, por implementar).
      console.error('sendAccessCodeEmail failed', e);
    }

    return json({ matched: true, sessionId: result.out_session_id });
  } catch (e) {
    console.error('auto-activate-payment error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
