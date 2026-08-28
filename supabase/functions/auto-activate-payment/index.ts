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

// Formato real observado (Secção 0), e-Mola:
//   "ID Trans: PP260821.2115.C86954. Recebeu 40.00MT de 878241021, sandra
//   maria menzissane hibrantes as 21:15:58 21/08/2026. Conteudo:
//   Profissional. O seu novo saldo e de 47.00MT."
const SMS_RE_EMOLA =
  /ID\s*Trans:\s*(?<transactionId>.+?)\.\s*Recebeu\s*(?<amount>[\d.,]+)\s*MT\s*de\s*(?<payerPhone>\d+),\s*(?<payerName>.+?)\s*as\s*(?<time>\d{2}:\d{2}:\d{2})\s*(?<date>\d{2}\/\d{2}\/\d{4})\.\s*Conteudo:\s*(?<planCode>.+?)\.\s*O seu novo saldo/i;

// Formato real observado, M-Pesa (sem "Conteudo" — o M-Pesa não tem campo de
// referência livre, por isso o plano tem de ser identificado só pelo valor,
// via resolvePlanByAmount abaixo). Cobre tanto a transferência normal
// (mesma operadora) como a cross-operadora (o texto a seguir à hora muda —
// por isso a âncora final foi removida, só o essencial antes disso importa):
//   Mesma operadora: "Confirmado DHO8LBL6G94. Recebeste 10.00MT de
//   258844134159 - ALBERTINA aos 24/8/26 as 7:06 PM. O teu novo saldo
//   M-Pesa e de 16.94MT. ..."
//   Cross-operadora: "Confirmado DHP2LBZWGQG. Recebeste  300.00MT de
//   913770 - SIMO aos 25/8/26  as 6:13 PM o novo saldo  M-Pesa e de
//   301.94MT. ..." — note o "de 913770": não é um telefone real (só 6
//   dígitos, não 9) — é um código mascarado da operadora de origem, nunca
//   vai bater com um contact_phone real. resolvePayerPhone abaixo trata
//   isto: só usa o telefone extraído se tiver exactamente 9 dígitos depois
//   de normalizado, senão passa '' (Secção 4.3, critério de telefone
//   ignorado quando desconhecido — migração 20260827190000).
const SMS_RE_MPESA =
  /Confirmado\s+(?<transactionId>\S+?)\.\s*Recebeste\s*(?<amount>[\d.,]+)\s*MT\s*de\s*(?<payerPhone>\d+)\s*-\s*(?<payerName>.+?)\s*aos\s*(?<date>\d{1,2}\/\d{1,2}\/\d{2,4})\s*as\s*(?<time>\d{1,2}:\d{2}\s*[AP]M)/i;

// Formato real observado, e-Mola a receber de outra operadora (cross-
// operadora do lado do e-Mola — molde completamente diferente do "ID
// Trans:" normal, sem telefone nenhum e sem "Conteudo"; plano identificado
// só pelo valor, como o M-Pesa):
//   "ID da transacao: CI260827.1923.v63079. Acabou de receber dinheiro da
//   mPesa SIMO as 19:23 27/08/2026, montante: 5.00 MT, Novo saldo: 172.00
//   MT. Obrigado!"
const SMS_RE_EMOLA_CROSS =
  /ID\s*da\s*transacao:\s*(?<transactionId>\S+?)\.\s*Acabou\s*de\s*receber\s*dinheiro\s*da\s*mPesa\s*(?<payerName>.+?)\s*as\s*(?<time>\d{2}:\d{2})\s*(?<date>\d{2}\/\d{2}\/\d{4}),\s*montante:\s*(?<amount>[\d.,]+)\s*MT/i;

// Normaliza para os últimos 9 dígitos (formato local moçambicano, sem
// "258"/"+258") — mesma lógica duplicada em normalizePhone de
// src/lib/checkoutSessions.ts (esta Edge Function não importa de src/).
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

// Secção 4.3 (M-Pesa): sem "Conteudo", o plano é identificado só pelo
// valor — reverse lookup contra os preços actuais de billing_plans (8
// preço-cheio + 4 variantes com desconto, só Profissional — os mesmos 12
// valores mostrados nos QR/Secção 2.1, `applyMultiRestaurantDiscount` de
// src/lib/billing.ts espelhado aqui). Se o valor coincidir com mais do que
// um plano (preços editados de forma a colidirem), devolve mais do que um
// id — o chamador trata isso como 'ambiguous_amount', nunca activa às
// cegas (4.5).
async function resolvePlanByAmount(admin: ReturnType<typeof createClient>, amount: number): Promise<string[]> {
  const { data } = await admin.from('billing_plans').select('id, price');
  const rows = (data ?? []) as { id: string; price: number | string }[];
  const target = Math.round(amount * 100);
  const matches = new Set<string>();
  for (const row of rows) {
    const price = Number(row.price);
    if (Math.round(price * 100) === target) matches.add(row.id);
    if (!row.id.startsWith('basic-')) {
      const discounted = Math.round(price * 0.8);
      if (Math.round(discounted * 100) === target) matches.add(row.id);
    }
  }
  return [...matches];
}

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
  reason: 'unparseable' | 'unknown_plan' | 'no_match' | 'ambiguous_amount',
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

    // Heartbeat para check-payment-webhook-silence (migração
    // 20260828010000): qualquer pedido que passe a autenticação conta,
    // seja qual for o resultado do parsing/correspondência a seguir —
    // isto mede "o webhook está a ser chamado", não "os pagamentos estão
    // a bater certo" (isso é D5/checkout_match_failures). Melhor esforço,
    // nunca bloqueia nem falha o resto do pedido.
    admin.from('system_payment_accounts').update({ last_sms_seen_at: new Date().toISOString() }).eq('id', 1)
      .then(({ error }) => { if (error) console.error('heartbeat update failed', error); });

    const text = await extractSmsText(req);
    if (!text) return json({ error: 'Empty body' }, 400);

    const emolaMatch = SMS_RE_EMOLA.exec(text);
    const mpesaMatch = emolaMatch ? null : SMS_RE_MPESA.exec(text);
    const emolaCrossMatch = emolaMatch || mpesaMatch ? null : SMS_RE_EMOLA_CROSS.exec(text);
    if (!emolaMatch?.groups && !mpesaMatch?.groups && !emolaCrossMatch?.groups) {
      await logFailure(admin, 'unparseable', text, null);
      await notifySuperadminFailure(admin, supabaseUrl, serviceKey, 'SMS recebida não corresponde a nenhum formato conhecido (e-Mola, M-Pesa, ou cross-operadora) — ver registo para rever à mão.');
      return json({ matched: false, reason: 'unparseable' });
    }

    // O plano é sempre identificado só pelo valor (resolvePlanByAmount),
    // nunca pelo "Conteudo" — deixou de ser preciso mostrar/pedir isso ao
    // cliente (removido do AutoPaymentDialog), já que cada um dos 12
    // preços (8 + 4 variantes com desconto) já é único por construção
    // (Secção 2.1); 'planCode' continua a ser extraído do e-Mola normal só
    // para auditoria (a SMS real continua a trazê-lo, vem do QR pré-
    // gerado — Secção 1), nunca usado para decidir o plano.
    //
    // Nenhum dos três formatos tem garantidamente um telefone utilizável:
    // 'mpesa' e 'emola_cross' cross-operadora só trazem um código mascarado
    // (ex. 6 dígitos) ou nada — só um valor com exactamente 9 dígitos
    // depois de normalizado é tratado como telefone real (Secção 4.3);
    // qualquer outra coisa passa '' para o critério de telefone ser
    // ignorado na correspondência (migração 20260827190000).
    const provider = emolaMatch?.groups ? 'emola' : mpesaMatch?.groups ? 'mpesa' : 'emola_cross';
    const groups = (emolaMatch?.groups ?? mpesaMatch?.groups ?? emolaCrossMatch!.groups)!;
    const transactionId = groups.transactionId.trim();
    const payerPhoneRaw = groups.payerPhone ?? '';
    const amount = parseFloat(groups.amount.replace(',', '.'));
    const normalizedRaw = normalizePhone(payerPhoneRaw);
    const normalizedPayerPhone = normalizedRaw.length === 9 ? normalizedRaw : '';
    const planCode = provider === 'emola' ? groups.planCode.trim().toUpperCase() : undefined;

    const baseExtracted = { transactionId, amount, payerPhoneRaw, normalizedPayerPhone, provider, planCode };

    if (!Number.isFinite(amount)) {
      await logFailure(admin, 'unknown_plan', text, baseExtracted);
      await notifySuperadminFailure(admin, supabaseUrl, serviceKey, `Valor inválido extraído da SMS (${provider}).`);
      return json({ matched: false, reason: 'unknown_plan' });
    }

    const candidatePlans = await resolvePlanByAmount(admin, amount);
    if (candidatePlans.length !== 1) {
      await logFailure(admin, candidatePlans.length === 0 ? 'unknown_plan' : 'ambiguous_amount', text, { ...baseExtracted, candidatePlans });
      await notifySuperadminFailure(
        admin, supabaseUrl, serviceKey,
        candidatePlans.length === 0
          ? `${provider}: valor ${amount} MT não corresponde a nenhum plano actual.`
          : `${provider}: valor ${amount} MT corresponde a mais do que um plano (${candidatePlans.join(', ')}) — preços colidem, corrigir em SuperAdminPage.`,
      );
      return json({ matched: false, reason: candidatePlans.length === 0 ? 'unknown_plan' : 'ambiguous_amount' });
    }
    const plan = candidatePlans[0];

    const extracted = { ...baseExtracted, plan };

    const { data: rows, error } = await admin.rpc('match_and_activate_checkout_session', {
      p_plan: plan,
      p_amount: amount,
      p_transaction_id: transactionId,
      p_payer_phone: normalizedPayerPhone,
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
        `Sem sessão pendente única para ${plan} (${amount} MT, de ${normalizedPayerPhone}) — pode ser 0 ou mais do que 1 candidata (plano+valor+telefone).`,
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
