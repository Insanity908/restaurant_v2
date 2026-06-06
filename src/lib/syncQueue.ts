// Offline-first sync queue (backend-agnostic).
// Mutations are applied locally and pushed when a backend handler is
// registered AND the browser reports online. Without a handler the queue
// just accumulates ops, ready to be flushed later.

export type SyncEntity = 'customer';
export type SyncOpType = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'error';

export interface SyncOp {
  id: string;
  entity: SyncEntity;
  type: SyncOpType;
  entityId: string;
  payload?: unknown;
  at: string;
  status: SyncStatus;
  attempts: number;
  error?: string;
}

const STORAGE_KEY = 'sync_queue';

type Listener = (ops: SyncOp[]) => void;
const listeners = new Set<Listener>();

function read(): SyncOp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(ops: SyncOp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  listeners.forEach(l => l(ops));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const syncQueue = {
  list: read,
  pendingCount: () => read().filter(o => o.status !== 'error').length,
  errorCount: () => read().filter(o => o.status === 'error').length,
  subscribe(l: Listener) {
    listeners.add(l);
    l(read());
    return () => listeners.delete(l);
  },
  enqueue(op: Omit<SyncOp, 'id' | 'at' | 'status' | 'attempts'>) {
    const all = read();
    all.push({ ...op, id: uid(), at: new Date().toISOString(), status: 'pending', attempts: 0 });
    write(all);
  },
  clearErrors() {
    write(read().filter(o => o.status !== 'error'));
  },
  clearAll() {
    write([]);
  },
};

// Backend handler — null by default. Wire to a real backend later.
type Handler = (op: SyncOp) => Promise<void>;
let handler: Handler | null = null;

export function registerSyncHandler(h: Handler | null) {
  handler = h;
}

let flushing = false;
export async function flushQueue(): Promise<{ pushed: number; failed: number; skipped: number }> {
  if (flushing) return { pushed: 0, failed: 0, skipped: 0 };
  if (!handler || !navigator.onLine) {
    return { pushed: 0, failed: 0, skipped: read().length };
  }
  flushing = true;
  let pushed = 0;
  let failed = 0;
  try {
    const ops = read();
    for (const op of ops) {
      if (op.status === 'error' && op.attempts >= 5) continue;
      op.status = 'syncing';
      write(ops);
      try {
        await handler(op);
        // remove on success
        const remaining = read().filter(o => o.id !== op.id);
        write(remaining);
        pushed++;
      } catch (err) {
        op.status = 'error';
        op.attempts += 1;
        op.error = err instanceof Error ? err.message : String(err);
        write(read().map(o => (o.id === op.id ? op : o)));
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { pushed, failed, skipped: 0 };
}

// Auto-flush on regaining connection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushQueue();
  });
}
