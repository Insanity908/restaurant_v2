/**
 * Tenants + subscriptions.
 *
 * Backed by Supabase (tables `tenants`, `subscriptions`, `subscription_history`).
 * A localStorage cache keeps the synchronous read API used across the UI, while
 * every mutation goes through the `subscription-status` edge function, which is
 * the single source of truth for licence state (block / unblock / extend /
 * activate) and enforces super-admin authorisation server-side.
 */
import { Tenant, BillingPlan, SubscriptionStatus } from '@/types/restaurant';
import { supabase } from '@/integrations/supabase/client';

const KEY = 'tenants';
const CURRENT_KEY = 'current_tenant_id';

function read(): Tenant[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list: Tenant[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}
function upsertCache(t: Tenant) {
  const all = read();
  const idx = all.findIndex(x => x.id === t.id);
  if (idx === -1) all.push(t); else all[idx] = t;
  write(all);
}

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

type Row = {
  id: string;
  name: string;
  owner_email: string;
  owner_phone: string | null;
  license_key: string;
  created_at: string;
  // `subscriptions.tenant_id` is the PRIMARY KEY (1:1 with tenants), so
  // PostgREST embeds it as a single object, not an array — indexing it
  // with `[0]` (as this used to) is always `undefined`, which silently
  // made every tenant show fake "trial / 0 dias" data regardless of its
  // real subscription state, and made block/extend/reduce/activate look
  // like no-ops even though they succeeded server-side.
  subscriptions?: {
    plan: BillingPlan | null;
    status: SubscriptionStatus;
    started_at: string | null;
    expires_at: string | null;
    last_payment_ref: string | null;
    blocked_by_admin: boolean;
    block_reason: string | null;
  } | null;
  subscription_history?: { plan: BillingPlan; paid_at: string; ref: string | null }[] | null;
};

function mapRow(r: Row): Tenant {
  const s = r.subscriptions;
  return {
    id: r.id,
    name: r.name,
    ownerEmail: r.owner_email,
    ownerPhone: r.owner_phone ?? undefined,
    licenseKey: r.license_key,
    createdAt: r.created_at,
    subscription: {
      plan: s?.plan ?? null,
      status: s?.status ?? 'trial',
      startedAt: s?.started_at ?? undefined,
      expiresAt: s?.expires_at ?? undefined,
      lastPaymentRef: s?.last_payment_ref ?? undefined,
      blockedByAdmin: s?.blocked_by_admin ?? false,
      blockReason: s?.block_reason ?? undefined,
      history: (r.subscription_history ?? [])
        .map(h => ({ plan: h.plan, paidAt: h.paid_at, ref: h.ref ?? undefined }))
        .sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
    },
  };
}

const SELECT =
  'id, name, owner_email, owner_phone, license_key, created_at,' +
  ' subscriptions(plan, status, started_at, expires_at, last_payment_ref, blocked_by_admin, block_reason),' +
  ' subscription_history(plan, paid_at, ref)';

/* ------------------------------------------------------------------ */
/* Async API (real queries)                                            */
/* ------------------------------------------------------------------ */

/** Fetch every tenant visible to the caller (all of them for super-admins). */
export async function fetchTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase.from('tenants').select(SELECT).order('created_at', { ascending: false });
  if (error) { console.warn('fetchTenants failed', error.message); return read(); }
  const list = (data as unknown as Row[]).map(mapRow);
  write(list);
  return list;
}

/** Fetch a single tenant and refresh the cache entry. */
export async function fetchTenant(id: string): Promise<Tenant | null> {
  const { data, error } = await supabase.from('tenants').select(SELECT).eq('id', id).maybeSingle();
  if (error || !data) return tenantStore.getById(id);
  const t = mapRow(data as unknown as Row);
  upsertCache(t);
  return t;
}

type Action =
  | { action: 'status'; tenantId: string }
  | { action: 'block'; tenantId: string; reason?: string }
  | { action: 'unblock'; tenantId: string }
  | { action: 'extend'; tenantId: string; days: number }
  | { action: 'reduce'; tenantId: string; days: number }
  | { action: 'activate'; tenantId: string; plan: BillingPlan; ref?: string }
  | { action: 'delete'; tenantId: string };

async function callSubscription(body: Action): Promise<{ ok: boolean; error?: string; tenant?: Tenant }> {
  const { data, error } = await supabase.functions.invoke('subscription-status', { body });
  if (error) {
    let details = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === 'function') {
      try { details = (await ctx.text()) || details; } catch { /* ignore */ }
    }
    console.warn('subscription-status failed', details);
    return { ok: false, error: details };
  }
  const payload = data as { tenant?: Row; deleted?: boolean };
  if (payload?.deleted) {
    write(read().filter(t => t.id !== body.tenantId));
    return { ok: true };
  }
  if (payload?.tenant) {
    const t = mapRow(payload.tenant);
    upsertCache(t);
    return { ok: true, tenant: t };
  }
  return { ok: true };
}

/** Re-evaluate (and persist) the licence state of a tenant server-side. */
export const refreshSubscription = (tenantId: string) => callSubscription({ action: 'status', tenantId });

/**
 * Create a new restaurant owned by the current user (trial subscription).
 *
 * IMPORTANT: this goes through the `bootstrap-tenant` edge function (service
 * role) instead of inserting the tenant/membership/role rows directly from
 * the client. Direct client inserts hit a chicken-and-egg RLS problem: the
 * policy that lets you insert your OWN admin membership requires you to
 * already be a tenant admin of that tenant — which is impossible for a
 * brand-new tenant. Using the edge function (which runs with the service
 * role and therefore bypasses RLS) is what makes account creation on signup
 * work at all, so we reuse it here with `additional: true` so it always
 * provisions a new tenant instead of returning the existing one.
 */
export async function createTenant(input: { name: string; ownerEmail: string; ownerPhone?: string; ownerName?: string }): Promise<Tenant | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase.functions.invoke('bootstrap-tenant', {
    body: {
      restaurantName: input.name.trim(),
      ownerName: input.ownerName,
      ownerPhone: input.ownerPhone,
      additional: true,
    },
  });
  if (error || !data?.tenantId) {
    console.warn('createTenant failed', error?.message ?? 'no tenantId returned');
    return null;
  }
  return fetchTenant(data.tenantId as string);
}

/* ------------------------------------------------------------------ */
/* Synchronous cache API (unchanged surface)                           */
/* ------------------------------------------------------------------ */

export const tenantStore = {
  getAll: read,
  getById: (id: string) => read().find(t => t.id === id) || null,
  getByLicenseKey: (k: string) => read().find(t => t.licenseKey === k.trim()) || null,
  current(): Tenant | null {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return null;
    return tenantStore.getById(id);
  },
  setCurrent(id: string | null) {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  },
  create: createTenant,
  block: (id: string, reason: string) => callSubscription({ action: 'block', tenantId: id, reason }),
  unblock: (id: string) => callSubscription({ action: 'unblock', tenantId: id }),
  extend: (id: string, days: number) => callSubscription({ action: 'extend', tenantId: id, days }),
  reduce: (id: string, days: number) => callSubscription({ action: 'reduce', tenantId: id, days }),
  activatePlan: (id: string, plan: BillingPlan, ref?: string) =>
    callSubscription({ action: 'activate', tenantId: id, plan, ref }),
  remove: (id: string) => callSubscription({ action: 'delete', tenantId: id }),
  daysUntilExpiry(t: Tenant): number {
    if (!t.subscription.expiresAt) return 0;
    return Math.ceil((new Date(t.subscription.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  },
};

/* ------------------------------------------------------------------ */
/* Team information (super-admin dashboard)                            */
/* ------------------------------------------------------------------ */

export interface TenantTeam {
  tenantId: string;
  membersCount: number;
  admins: { id: string; name: string; email: string; phone?: string }[];
}

/** Real membership + admin contact info per tenant, from profiles/user_roles. */
export async function fetchTenantTeams(): Promise<Record<string, TenantTeam>> {
  const [{ data: members }, { data: roles }] = await Promise.all([
    supabase.from('tenant_members').select('tenant_id, user_id'),
    supabase.from('user_roles').select('tenant_id, user_id, role'),
  ]);

  const teams: Record<string, TenantTeam> = {};
  const ensure = (id: string) => (teams[id] ??= { tenantId: id, membersCount: 0, admins: [] });
  (members ?? []).forEach(m => { ensure(m.tenant_id).membersCount += 1; });

  const adminRoles = (roles ?? []).filter(r => r.role === 'admin' && r.tenant_id);
  const ids = Array.from(new Set(adminRoles.map(r => r.user_id)));
  let profiles: { id: string; name: string | null; email: string | null; phone: string | null }[] = [];
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, name, email, phone').in('id', ids);
    profiles = data ?? [];
  }
  adminRoles.forEach(r => {
    const p = profiles.find(x => x.id === r.user_id);
    ensure(r.tenant_id!).admins.push({
      id: r.user_id,
      name: p?.name ?? p?.email ?? r.user_id.slice(0, 8),
      email: p?.email ?? '',
      phone: p?.phone ?? undefined,
    });
  });
  return teams;
}
