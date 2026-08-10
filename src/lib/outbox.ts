import { supabase } from '@/integrations/supabase/client';

/**
 * Offline write outbox.
 *
 * Every cloud mutation goes through `queueWrite`. When the device is online the
 * write is attempted immediately; if it fails because of connectivity the
 * operation is persisted in localStorage and replayed (in order) as soon as the
 * connection returns.
 *
 * Conflict resolution: writes can carry a `guard` (last-write-wins by
 * timestamp). A queued update only lands if the server row was not modified
 * more recently than the moment the change was made on this device.
 */

export type WriteGuard = { column: string; op: 'lte' | 'lt'; value: string };

export type WriteOp = {
  id: string;
  at: string;
  table: string;
  action: 'insert' | 'update' | 'delete' | 'upsert';
  values?: unknown;
  match?: Record<string, unknown>;
  guard?: WriteGuard;
  onConflict?: string;
  label?: string;
  /** Resource key (table:id) used to detect locally-pending records. */
  resource?: string;
  attempts?: number;
  failed?: boolean;
  error?: string;
};

const KEY = 'sync_outbox_v1';
type Listener = (state: OutboxState) => void;
export type OutboxState = { pending: number; failed: number; ops: WriteOp[] };
const listeners = new Set<Listener>();

function read(): WriteOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WriteOp[]) : [];
  } catch { return []; }
}

function stateOf(ops: WriteOp[]): OutboxState {
  return { pending: ops.filter(o => !o.failed).length, failed: ops.filter(o => o.failed).length, ops };
}

function write(ops: WriteOp[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* quota */ }
  const s = stateOf(ops);
  listeners.forEach(l => l(s));
}

export function outboxState(): OutboxState { return stateOf(read()); }
export function pendingCount(): number { return outboxState().pending; }

export function subscribeOutbox(l: Listener): () => void {
  listeners.add(l);
  l(outboxState());
  return () => { listeners.delete(l); };
}

/** Ids of records with unsynced local changes — server data must not clobber them. */
export function pendingResourceIds(table: string | string[]): Set<string> {
  const tables = Array.isArray(table) ? table : [table];
  const ids = new Set<string>();
  read().forEach(op => {
    if (!tables.includes(op.table) || !op.resource) return;
    const id = op.resource.split(':')[1];
    if (id) ids.add(id);
  });
  return ids;
}

/** Discard every queued operation (destructive — local changes are lost). */
export function clearOutbox() { write([]); }

/** Un-mark failures so they are attempted again on the next flush. */
export async function retryOutbox() {
  write(read().map(o => ({ ...o, failed: false, attempts: 0, error: undefined })));
  await flushOutbox();
}

/** Remove a single operation from the queue. */
export function dropOperation(id: string) { write(read().filter(o => o.id !== id)); }

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Network/transport failures should be retried; server rejections should not. */
function isTransient(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isOffline()) return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('timeout')
    || msg.includes('load failed')
    || error.code === '' // supabase-js transport errors carry an empty code
    || error.code === 'PGRST000';
}

async function execute(op: WriteOp): Promise<{ error: { message: string; code?: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = supabase.from(op.table as never);
  try {
    let res;
    if (op.action === 'insert') res = await q.insert(op.values);
    else if (op.action === 'upsert') res = await q.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
    else if (op.action === 'update') res = await applyFilters(q.update(op.values), op);
    else res = await applyFilters(q.delete(), op);
    return { error: res?.error ?? null };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : 'network error', code: '' } };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(builder: any, op: WriteOp) {
  let b = builder;
  Object.entries(op.match ?? {}).forEach(([k, v]) => { b = b.eq(k, v); });
  // Last-write-wins: skip rows the server changed after this local edit.
  if (op.guard) b = op.guard.op === 'lt' ? b.lt(op.guard.column, op.guard.value) : b.lte(op.guard.column, op.guard.value);
  return b;
}

function enqueue(op: WriteOp) {
  const ops = read();
  ops.push(op);
  write(ops);
}

/**
 * Perform a cloud write, falling back to the offline queue when unreachable.
 * Always resolves — callers keep their optimistic local state either way.
 */
export async function queueWrite(
  input: Omit<WriteOp, 'id' | 'at'>,
): Promise<{ error: { message: string } | null; queued?: boolean }> {
  const op: WriteOp = { ...input, id: crypto.randomUUID(), at: new Date().toISOString() };

  if (isOffline() || read().some(o => !o.failed)) {
    // Preserve ordering: once something is queued, everything queues behind it.
    enqueue(op);
    void flushOutbox();
    return { error: null, queued: true };
  }

  const { error } = await execute(op);
  if (error && isTransient(error)) {
    enqueue(op);
    return { error: null, queued: true };
  }
  if (error) console.warn(`[cloud-sync] ${op.label ?? op.table}.${op.action} failed: ${error.message}`);
  return { error };
}

let flushing = false;

/** Replay every queued operation in order. Stops at the first transient failure. */
export async function flushOutbox(): Promise<void> {
  if (flushing || isOffline()) return;
  flushing = true;
  try {
    for (;;) {
      const ops = read();
      const next = ops.find(o => !o.failed);
      if (!next) return;
      const { error } = await execute(next);
      if (error && isTransient(error)) return; // still offline — try again later
      const rest = read();
      const idx = rest.findIndex(o => o.id === next.id);
      if (idx === -1) continue;
      if (error) {
        // Permanent rejection: keep it visible so the user can retry or clear.
        rest[idx] = { ...rest[idx], failed: true, attempts: (rest[idx].attempts ?? 0) + 1, error: error.message };
        console.warn(`[cloud-sync] ${next.label ?? next.table}.${next.action} rejected: ${error.message}`);
      } else {
        rest.splice(idx, 1);
      }
      write(rest);
    }
  } finally {
    flushing = false;
  }
}

let started = false;
/** Start listening for connectivity so queued writes are pushed automatically. */
export function startOutbox() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { void flushOutbox(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushOutbox();
  });
  setInterval(() => { void flushOutbox(); }, 30_000);
  void flushOutbox();
}

/* -------------------------------------------------------------------------- */
/* Drop-in builder that mirrors the supabase-js write API but goes through the  */
/* outbox, so any mutation made offline is replayed once back online.           */
/* -------------------------------------------------------------------------- */

class PendingWrite implements PromiseLike<{ error: { message: string } | null }> {
  private op: Omit<WriteOp, 'id' | 'at'>;
  constructor(op: Omit<WriteOp, 'id' | 'at'>) { this.op = { ...op, match: { ...(op.match ?? {}) } }; }
  eq(column: string, value: unknown) { this.op.match = { ...(this.op.match ?? {}), [column]: value }; return this; }
  /** Last-write-wins guard: only apply if the server row is not newer. */
  guard(column: string, value: string, op: 'lte' | 'lt' = 'lte') { this.op.guard = { column, value, op }; return this; }
  /** Tag the affected record so local pending changes survive server refreshes. */
  resource(id: string) { this.op.resource = `${this.op.table}:${id}`; return this; }
  then<R1 = { error: { message: string } | null }, R2 = never>(
    onfulfilled?: ((v: { error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return queueWrite(this.op).then(onfulfilled, onrejected);
  }
}

export function cloud(table: string) {
  return {
    insert: (values: unknown) => new PendingWrite({ table, action: 'insert', values }),
    upsert: (values: unknown, opts?: { onConflict?: string }) =>
      new PendingWrite({ table, action: 'upsert', values, onConflict: opts?.onConflict }),
    update: (values: unknown) => new PendingWrite({ table, action: 'update', values }),
    delete: () => new PendingWrite({ table, action: 'delete' }),
  };
}
