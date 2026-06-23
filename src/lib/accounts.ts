import { Account } from '@/types/restaurant';

const KEY = 'accounts';
const SESSION_KEY = 'account_session_id';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function read(): Account[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(list: Account[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export const accountStore = {
  getAll: read,
  getById: (id: string) => read().find(a => a.id === id) || null,
  getByEmail: (email: string) => read().find(a => a.email.toLowerCase() === email.toLowerCase().trim()) || null,
  async create(input: { tenantId: string; email: string; password: string; name: string; role: 'manager' | 'superadmin' }): Promise<Account> {
    const all = read();
    if (all.some(a => a.email.toLowerCase() === input.email.toLowerCase().trim())) {
      throw new Error('Email já registado');
    }
    const acc: Account = {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId: input.tenantId,
      email: input.email.trim().toLowerCase(),
      passwordHash: await sha256(input.password),
      role: input.role,
      name: input.name.trim(),
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
  remove: (id: string) => write(read().filter(a => a.id !== id)),
  current(): Account | null {
    const id = localStorage.getItem(SESSION_KEY);
    return id ? accountStore.getById(id) : null;
  },
  setCurrent(id: string | null) {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  },
  removeByTenant: (tenantId: string) => write(read().filter(a => a.tenantId !== tenantId)),
};

export { sha256 };
