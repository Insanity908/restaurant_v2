// D4 (docs/spec-automacao-confirmacao-pagamentos.md): reenvia o
// access_code de uma sessão já paga, para o caso de o email original não
// ter chegado ou se ter perdido. Nunca gera um código novo — reenviar
// invalidaria sem aviso um código que o cliente já tenha ou que esteja
// prestes a receber de um envio anterior ainda em trânsito.
//
// Autenticação: JWT normal de utilizador — o próprio tenant member pede o
// reenvio de uma sessão que já é sua (confirmado via is_tenant_member,
// mesma verificação que a RLS de checkout_sessions já aplicaria a uma
// leitura directa do cliente).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  plan: z.enum([
    'monthly', 'quarterly', 'semiannual', 'annual',
    'basic-monthly', 'basic-quarterly', 'basic-semiannual', 'basic-annual',
  ]),
  amount: z.number().positive(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { tenantId, plan, amount } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isSuper = (roles ?? []).some(r => r.role === 'superadmin');
    if (!isSuper) {
      const { data: member } = await admin
        .from('tenant_members').select('tenant_id')
        .eq('tenant_id', tenantId).eq('user_id', userData.user.id).maybeSingle();
      if (!member) return json({ error: 'Sem acesso a este restaurante.' }, 403);
    }

    const { data: session, error } = await admin
      .from('checkout_sessions')
      .select('contact_email, access_code')
      .eq('tenant_id', tenantId)
      .eq('plan', plan)
      .eq('amount', amount)
      .eq('status', 'paid')
      .not('access_code', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!session) return json({ error: 'Nenhum pagamento confirmado encontrado para este plano.' }, 404);

    const { data: planRow } = await admin.from('billing_plans').select('label').eq('id', plan).maybeSingle();
    await sendAccessCodeEmail(session.contact_email, session.access_code!, planRow?.label ?? plan);

    return json({ sent: true });
  } catch (e) {
    console.error('resend-access-code error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
