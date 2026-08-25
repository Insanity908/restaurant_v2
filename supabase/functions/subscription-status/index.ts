// Single source of truth for tenant licence state.
// - `status`: any tenant member (or super-admin) — recomputes and persists expiry.
// - `block` / `unblock` / `extend` / `reduce` / `activate` / `delete`: super-admin only.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

// Os 4 primeiros são o nível "Profissional" (implícito, sem prefixo); os
// "basic-*" são o nível "Básico" — ver planTier() em src/lib/billing.ts.
const PLAN_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
  'basic-monthly': 1, 'basic-quarterly': 3, 'basic-semiannual': 6, 'basic-annual': 12,
};
const TRIAL_DAYS = 7;

const BodySchema = z.object({
  action: z.enum(['status', 'block', 'unblock', 'extend', 'reduce', 'activate', 'delete']),
  tenantId: z.string().uuid(),
  reason: z.string().max(300).optional(),
  days: z.number().int().min(1).max(3650).optional(),
  plan: z.enum([
    'monthly', 'quarterly', 'semiannual', 'annual',
    'basic-monthly', 'basic-quarterly', 'basic-semiannual', 'basic-annual',
  ]).optional(),
  ref: z.string().max(200).optional(),
});

const SELECT =
  'id, name, owner_email, owner_phone, license_key, created_at,' +
  ' subscriptions(plan, status, started_at, expires_at, last_payment_ref, blocked_by_admin, block_reason),' +
  ' subscription_history(plan, paid_at, ref, price)';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
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
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { action, tenantId, reason, days, plan, ref } = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorisation.
    const { data: roles } = await admin.from('user_roles').select('role, tenant_id').eq('user_id', userId);
    const isSuper = (roles ?? []).some(r => r.role === 'superadmin');
    if (!isSuper) {
      if (action !== 'status') return json({ error: 'Apenas o super-admin pode alterar subscrições.' }, 403);
      const { data: member } = await admin
        .from('tenant_members').select('tenant_id')
        .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
      if (!member) return json({ error: 'Sem acesso a este restaurante.' }, 403);
    }

    const { data: tenant } = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle();
    if (!tenant) return json({ error: 'Restaurante não encontrado.' }, 404);

    if (action === 'delete') {
      // Antes de apagar o tenant (o que já faz cascade a tenant_members/
      // user_roles/subscriptions/subscription_history), guarda quem era
      // membro — depois de apagar, quem ficar sem NENHUM outro restaurante
      // (multi-restaurante: alguém pode ser dono de vários) e não for
      // superadmin perde também a conta de autenticação; sem isto, o
      // login/telefone/email de toda a equipa ficava activo para sempre
      // "no ar", sem nenhum restaurante associado.
      const { data: members } = await admin
        .from('tenant_members').select('user_id').eq('tenant_id', tenantId);
      const memberIds = (members ?? []).map(m => m.user_id as string);

      const { error } = await admin.from('tenants').delete().eq('id', tenantId);
      if (error) return json({ error: error.message }, 400);

      for (const memberId of memberIds) {
        const { data: remaining } = await admin
          .from('tenant_members').select('tenant_id').eq('user_id', memberId).limit(1);
        if ((remaining ?? []).length > 0) continue;
        const { data: memberSuperRoles } = await admin
          .from('user_roles').select('role').eq('user_id', memberId).eq('role', 'superadmin');
        if ((memberSuperRoles ?? []).length > 0) continue;
        const { error: delErr } = await admin.auth.admin.deleteUser(memberId);
        if (delErr) console.warn('subscription-status delete: deleteUser failed', memberId, delErr.message);
      }

      return json({ deleted: true });
    }

    // Load (or create) the subscription row.
    let { data: sub } = await admin.from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle();
    if (!sub) {
      const now = new Date();
      const { data: created, error } = await admin.from('subscriptions').insert({
        tenant_id: tenantId,
        plan: null,
        status: 'trial',
        started_at: now.toISOString(),
        expires_at: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
        blocked_by_admin: false,
      }).select('*').single();
      if (error) return json({ error: error.message }, 400);
      sub = created;
    }

    const now = new Date();
    const patch: Record<string, unknown> = {};

    if (action === 'block') {
      patch.blocked_by_admin = true;
      patch.status = 'blocked';
      patch.block_reason = reason ?? 'Bloqueado pelo administrador';
    } else if (action === 'unblock') {
      patch.blocked_by_admin = false;
      patch.block_reason = null;
    } else if (action === 'extend') {
      const base = sub.expires_at && new Date(sub.expires_at) > now ? new Date(sub.expires_at) : now;
      patch.expires_at = new Date(base.getTime() + (days ?? 30) * 86400000).toISOString();
      patch.blocked_by_admin = false;
      patch.block_reason = null;
      patch.status = 'active';
    } else if (action === 'reduce') {
      // Ao contrário de 'extend', parte sempre da data de expiração actual
      // (mesmo que já tenha passado) — reduzir dias a partir de "agora"
      // quando já está expirado não faria sentido.
      const base = sub.expires_at ? new Date(sub.expires_at) : now;
      patch.expires_at = new Date(base.getTime() - (days ?? 30) * 86400000).toISOString();
      // Não mexe em blocked_by_admin/status aqui — o recomputo abaixo já
      // marca "expired" sozinho se a nova data ficar no passado.
    } else if (action === 'activate') {
      if (!plan) return json({ error: 'Plano em falta.' }, 400);
      const base = sub.expires_at && new Date(sub.expires_at) > now && sub.status === 'active'
        ? new Date(sub.expires_at) : now;
      patch.plan = plan;
      patch.status = 'active';
      patch.started_at = now.toISOString();
      patch.expires_at = addMonths(base, PLAN_MONTHS[plan]).toISOString();
      patch.last_payment_ref = ref ?? null;
      patch.blocked_by_admin = false;
      patch.block_reason = null;
      // Preço lido do servidor (não do body do pedido) para o snapshot —
      // um preço vindo do cliente seria falsificável; `billing_plans` é a
      // única fonte de verdade para quanto custava o plano nesta data.
      const { data: planRow } = await admin.from('billing_plans').select('price').eq('id', plan).maybeSingle();
      await admin.from('subscription_history').insert({
        tenant_id: tenantId, plan, paid_at: now.toISOString(), ref: ref ?? null,
        price: planRow?.price ?? null,
      });
    }

    // Always recompute the effective status from the (possibly patched) state.
    const effBlocked = (patch.blocked_by_admin ?? sub.blocked_by_admin) as boolean;
    const effExpires = (patch.expires_at ?? sub.expires_at) as string | null;
    const effStatus = (patch.status ?? sub.status) as string;
    let final = effStatus;
    if (effBlocked) final = 'blocked';
    else if (effExpires && new Date(effExpires).getTime() < now.getTime()) final = 'expired';
    else if (effStatus === 'blocked' || effStatus === 'expired') final = 'active';
    patch.status = final;

    // Para 'status' (chamada automaticamente por useLicense — em cada
    // mount, no reconnect do Realtime, no polling de 30min) o `patch` só
    // contém `status`, posto acima incondicionalmente. Se não mudou nada
    // face ao que já estava gravado, NÃO escrever: um UPDATE dispara um
    // evento Realtime mesmo que nenhuma coluna mude de valor, e esse evento
    // é precisamente o que faz useLicense chamar syncFromServer() outra
    // vez — sem este guard, isso reabre este mesmo pedido, que volta a
    // fazer UPDATE, que volta a disparar o evento: um ciclo que se
    // realimenta sozinho, sem qualquer atraso, e satura a ligação à base de
    // dados (visto em produção: 1400+ pedidos num minuto para um único
    // tenant, com falhas 503 em queries completamente não relacionadas
    // devido à saturação do pool de ligações). Ações explícitas do
    // super-admin (block/unblock/extend/reduce/activate) continuam sempre a
    // escrever — são mutações pedidas de propósito, não um recompute.
    const statusUnchanged = action === 'status' && final === sub.status;
    if (!statusUnchanged) {
      const { error: updErr } = await admin.from('subscriptions').update(patch).eq('tenant_id', tenantId);
      if (updErr) return json({ error: updErr.message }, 400);
    }

    const { data: full, error: readErr } = await admin.from('tenants').select(SELECT).eq('id', tenantId).single();
    if (readErr) return json({ error: readErr.message }, 400);

    return json({ tenant: full });
  } catch (e) {
    console.error('subscription-status error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
