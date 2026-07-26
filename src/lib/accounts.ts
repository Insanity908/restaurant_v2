import { Account } from '@/types/restaurant';

const KEY = 'accounts';
const SESSION_KEY = 'account_session_id';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Backfill tenantIds and migrate legacy 'manager' role to 'admin'. */
function migrate(list: Account[]): Account[] {
  let changed = false;
  const out = list.map(a => {
    const patched: Account = { ...a };
    // legacy role migration
    if ((patched.role as string) === 'manager') {
      patched.role = 'admin';
      changed = true;
    }
    if (!Array.isArray(patched.tenantIds) || patched.tenantIds.length === 0) {
      patched.tenantIds = patched.tenantId ? [patched.tenantId] : [];
      changed = true;
    }
    return patched;
  });
  if (changed) localStorage.setItem(KEY, JSON.stringify(out));
  return out;
}

function read(): Account[] {
  try { return migrate(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return []; }
}
function write(list: Account[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export const accountStore = {
  getAll: read,
  getById: (id: string) => read().find(a => a.id === id) || null,
  getByEmail: (email: string) => read().find(a => a.email.toLowerCase() === email.toLowerCase().trim()) || null,
  async create(input: { tenantId: string; email: string; password: string; name: string; role: 'admin' | 'superadmin'; phone?: string }): Promise<Account> {
    const all = read();
    if (all.some(a => a.email.toLowerCase() === input.email.toLowerCase().trim())) {
      throw new Error('Email já registado');
    }
    const acc: Account = {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: input.tenantId,
      tenantIds: [input.tenantId],
      email: input.email.trim().toLowerCase(),
      passwordHash: await sha256(input.password),
      role: input.role,
      name: input.name.trim(),
      phone: input.phone?.trim(),
      createdAt: new Date().toISOString(),
    };
    all.push(acc);
    write(all);
    return acc;
  },
  async login(email: string, password: string): Promise<Account> {
    const acc = read().find(a => a.email === email.toLowerCase().trim());
    if (!acc) throw new Error('Credenciais inválidas');
    const hash = await sha256(password);
    if (hash !== acc.passwordHash) throw new Error('Credenciais inválidas');
    localStorage.setItem(SESSION_KEY, acc.id);
    return acc;
  },
  async updatePassword(id: string, password: string) {
    const all = read();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return;
    all[idx].passwordHash = await sha256(password);
    write(all);
  },
  update(id: string, patch: Partial<Account>) {
    const all = read();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    write(all);
    return all[idx];
  },
  /** Attach an existing tenant id to an account (multi-restaurante). */
  attachTenant(accountId: string, tenantId: string) {
    const all = read();
    const idx = all.findIndex(a => a.id === accountId);
    if (idx === -1) return null;
    const set = new Set(all[idx].tenantIds || []);
    set.add(tenantId);
    all[idx].tenantIds = Array.from(set);
    if (!all[idx].tenantId) all[idx].tenantId = tenantId;
    write(all);
    return all[idx];
  },
  detachTenant(accountId: string, tenantId: string) {
    const all = read();
    const idx = all.findIndex(a => a.id === accountId);
    if (idx === -1) return null;
    all[idx].tenantIds = (all[idx].tenantIds || []).filter(id => id !== tenantId);
    write(all);
    return all[idx];
  },
  remove: (id: string) => write(read().filter(a => a.id !== id)),
  current(): Account | null {
    const id = localStorage.getItem(SESSION_KEY);
    return id ? accountStore.getById(id) : null;
  },
  setCurrent(id: string | null) {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  },
  removeByTenant: (tenantId: string) =>
    write(read()
      .map(a => ({ ...a, tenantIds: (a.tenantIds || []).filter(id => id !== tenantId) }))
      .filter(a => a.role === 'superadmin' || (a.tenantIds && a.tenantIds.length > 0))),
};

export { sha256 };
