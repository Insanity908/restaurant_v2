import { Tenant, BillingPlan, SubscriptionStatus } from '@/types/restaurant';
import { addMonths, PLANS } from './billing';

const KEY = 'tenants';
const CURRENT_KEY = 'current_tenant_id';
const TRIAL_DAYS = 7;

function read(): Tenant[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list: Tenant[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function genLicenseKey(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function computeStatus(t: Tenant): SubscriptionStatus {
  if (t.subscription.blockedByAdmin) return 'blocked';
  if (!t.subscription.expiresAt) return t.subscription.status;
  const now = Date.now();
  const exp = new Date(t.subscription.expiresAt).getTime();
  if (exp < now) return 'expired';
  return t.subscription.status === 'trial' ? 'trial' : 'active';
}

export const tenantStore = {
  getAll: read,
  getById: (id: string) => read().find(t => t.id === id) || null,
  getByLicenseKey: (k: string) => read().find(t => t.licenseKey === k.trim()) || null,
  current(): Tenant | null {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return null;
    const t = tenantStore.getById(id);
    if (!t) return null;
    const status = computeStatus(t);
    if (status !== t.subscription.status) {
      t.subscription.status = status;
      tenantStore.update(t.id, { subscription: t.subscription });
    }
    return t;
  },
  setCurrent(id: string | null) {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  },
  create(input: { name: string; ownerEmail: string; ownerPhone?: string }): Tenant {
    const all = read();
    const now = new Date();
    const tenant: Tenant = {
      id: `ten-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      ownerPhone: input.ownerPhone?.trim(),
      licenseKey: genLicenseKey(),
      createdAt: now.toISOString(),
      subscription: {
        plan: null,
        status: 'trial',
        startedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        history: [],
      },
    };
    all.push(tenant);
    write(all);
    return tenant;
  },
  update(id: string, updates: Partial<Tenant>): Tenant | null {
    const all = read();
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    write(all);
    return all[idx];
  },
  activatePlan(id: string, plan: BillingPlan, ref?: string): Tenant | null {
    const t = tenantStore.getById(id);
    if (!t) return null;
    const months = PLANS[plan].months;
    const now = new Date();
    const baseStart = t.subscription.expiresAt && new Date(t.subscription.expiresAt) > now && t.subscription.status === 'active'
      ? new Date(t.subscription.expiresAt)
      : now;
    const expires = addMonths(baseStart, months);
    const history = [...(t.subscription.history || []), { plan, paidAt: now.toISOString(), ref }];
    return tenantStore.update(id, {
      subscription: {
        plan,
        status: 'active',
        startedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        lastPaymentRef: ref,
        blockedByAdmin: false,
        blockReason: undefined,
        history,
      },
    });
  },
  block(id: string, reason: string): Tenant | null {
    const t = tenantStore.getById(id);
    if (!t) return null;
    return tenantStore.update(id, {
      subscription: { ...t.subscription, blockedByAdmin: true, status: 'blocked', blockReason: reason },
    });
  },
  unblock(id: string): Tenant | null {
    const t = tenantStore.getById(id);
    if (!t) return null;
    const sub = { ...t.subscription, blockedByAdmin: false, blockReason: undefined };
    sub.status = computeStatus({ ...t, subscription: sub });
    return tenantStore.update(id, { subscription: sub });
  },
  extend(id: string, days: number): Tenant | null {
    const t = tenantStore.getById(id);
    if (!t) return null;
    const base = t.subscription.expiresAt ? new Date(t.subscription.expiresAt) : new Date();
    const ext = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return tenantStore.update(id, {
      subscription: { ...t.subscription, expiresAt: ext.toISOString(), status: 'active', blockedByAdmin: false },
    });
  },
  remove(id: string) {
    write(read().filter(t => t.id !== id));
  },
  daysUntilExpiry(t: Tenant): number {
    if (!t.subscription.expiresAt) return 0;
    return Math.ceil((new Date(t.subscription.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  },
};
