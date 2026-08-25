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

/** Um dispositivo offline durante muito tempo (rede instável é o cenário
 *  normal desta app) não pode acumular operações sem limite — rebentaria o
 *  `localStorage` e tornaria o replay cada vez mais lento. Duas defesas:
 *  purga por idade (o caso comum — offline prolongado) e um tecto rígido
 *  (o caso extremo — volume enorme de escritas antes de completar 7 dias).
 *  Nenhuma delas é silenciosa: o que é descartado fica registado na
 *  consola e num toast, porque perder uma alteração real do utilizador
 *  merece ser visível, não uma limpeza invisível de manutenção. */
export const OUTBOX_MAX_OPS = 500;
export const OUTBOX_WARN_AT = 400;
export const OUTBOX_MAX_AGE_DAYS = 7;

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

/**
 * Resources with a write currently on the wire via the fast/online path of
 * `queueWrite` (below) — before it either succeeds or gets queued. Tracked
 * separately from the persisted outbox (not written to localStorage, no
 * listener notification) so the "a sincronizar…" badge doesn't flicker on
 * every ordinary online write; `pendingResourceIds` still reports them so
 * `mergePending` (store.ts) protects them.
 *
 * Without this, a concurrent read (a Realtime echo, another page mounting)
 * that lands mid-flight sees pre-write server data and — since the write
 * isn't in the outbox yet — `mergePending` has no reason to keep the local
 * version, silently reverting the optimistic change (e.g. a cancelled order
 * reappearing as active on another screen).
 */
const inFlight = new Map<string, number>();
function markInFlight(resource?: string) {
  if (!resource) return;
  inFlight.set(resource, (inFlight.get(resource) ?? 0) + 1);
}
function unmarkInFlight(resource?: string) {
  if (!resource) return;
  const n = (inFlight.get(resource) ?? 1) - 1;
  if (n <= 0) inFlight.delete(resource); else inFlight.set(resource, n);
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
  inFlight.forEach((_count, resource) => {
    const [t, id] = resource.split(':');
    if (tables.includes(t) && id) ids.add(id);
  });
  return ids;
}

function isStale(op: WriteOp, now: number): boolean {
  return now - new Date(op.at).getTime() > OUTBOX_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Nunca silencioso — quem usa a app não vê a consola, por isso um toast
 *  também. Importa `sonner` dinamicamente para `outbox.ts` não arrastar UI
 *  para todos os módulos que só querem `cloud()`/`queueWrite`. `async` (em
 *  vez de fire-and-forget) para quem chama poder esperar pelo toast — sem
 *  isto, o `import()` dinâmico resolve numa microtask que o chamador nunca
 *  aguarda, e o aviso podia nunca chegar a aparecer antes do resto do fluxo
 *  continuar (e tornava isto impossível de testar de forma determinística). */
async function notifyDiscarded(dropped: WriteOp[], reason: string): Promise<void> {
  console.warn(`[cloud-sync] outbox: ${dropped.length} operação(ões) descartada(s) — ${reason}`,
    dropped.map(o => `${o.table}.${o.action}${o.failed ? ' (falhada)' : ''}`));
  if (typeof window === 'undefined') return;
  try {
    const { toast } = await import('sonner');
    toast.error(`Sincronização: ${dropped.length} alteração${dropped.length === 1 ? '' : 'ões'} descartada${dropped.length === 1 ? '' : 's'} — ${reason}.`);
  } catch { /* toast é cosmético — a consola já registou o essencial */ }
}

/** Remove operações mais antigas que OUTBOX_MAX_AGE_DAYS. Chamado a cada
 *  ciclo de flush (não a cada leitura) para não pagar este custo em cada
 *  `getAll()`/`pendingResourceIds()` do resto da app. */
async function purgeStaleOps(): Promise<WriteOp[]> {
  const now = Date.now();
  const ops = read();
  const stale = ops.filter(o => isStale(o, now));
  if (stale.length === 0) return ops;
  const kept = ops.filter(o => !isStale(o, now));
  write(kept);
  await notifyDiscarded(stale, `mais de ${OUTBOX_MAX_AGE_DAYS} dias sem sincronizar`);
  return kept;
}

/** Tecto rígido — só entra em acção depois da purga por idade já ter
 *  corrido e mesmo assim a fila continuar grande de mais. Descarta primeiro
 *  as operações já FALHADAS mais antigas (rejeitadas permanentemente pelo
 *  servidor — não bloqueiam o replay de mais nada). Só se isso não chegar
 *  (500 escritas genuinamente por enviar, sem nenhuma falhada) é que
 *  descarta as mais antigas AINDA pendentes — pode quebrar a ordem de
 *  replay desse recurso específico, mas deixar a fila crescer sem limite é
 *  pior do que perder a operação mais antiga de 500. */
async function enforceCap(ops: WriteOp[]): Promise<WriteOp[]> {
  const over = ops.length - OUTBOX_MAX_OPS;
  if (over <= 0) return ops;

  const failedPositions = ops.reduce<number[]>((acc, o, i) => { if (o.failed) acc.push(i); return acc; }, []);
  const dropFromFailed = new Set(failedPositions.slice(0, over));
  let dropped = ops.filter((_, i) => dropFromFailed.has(i));
  let result = ops.filter((_, i) => !dropFromFailed.has(i));

  const stillOver = result.length - OUTBOX_MAX_OPS;
  if (stillOver > 0) {
    dropped = dropped.concat(result.slice(0, stillOver));
    result = result.slice(stillOver);
  }

  if (dropped.length > 0) await notifyDiscarded(dropped, `limite de ${OUTBOX_MAX_OPS} operações na fila`);
  return result;
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

// Numa ligação muito fraca (visto na prática: ~20 KB/s) um `fetch` pode
// nunca resolver nem rejeitar em tempo útil — sem um limite, esse único
// pedido pendurado bloqueava `flushOutbox` para sempre (o loop é sequencial,
// um `await` por operação), e toda a fila atrás dele ficava parada, mesmo
// que a ligação depois melhorasse. `withTimeout` força uma rejeição passado
// NETWORK_TIMEOUT_MS; a mensagem contém "timeout" de propósito para
// `isTransient()` a tratar como transitória (reentra na fila, não falha
// definitivamente). O pedido original em voo não é cancelado — só deixa de
// ser esperado; se vier a completar-se depois, o resultado é descartado e a
// retentativa (agora um upsert idempotente, ver stores) repete o trabalho
// sem duplicar nada.
const NETWORK_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: sem resposta do servidor em ${ms / 1000}s`)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

async function execute(op: WriteOp): Promise<{ error: { message: string; code?: string } | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = supabase.from(op.table as never);
  try {
    const call = (async () => {
      if (op.action === 'insert') return await q.insert(op.values);
      if (op.action === 'upsert') return await q.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
      if (op.action === 'update') return await applyFilters(q.update(op.values), op);
      return await applyFilters(q.delete(), op);
    })();
    const res = await withTimeout(call, NETWORK_TIMEOUT_MS);
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

async function enqueue(op: WriteOp): Promise<void> {
  let ops = read();
  ops.push(op);
  if (ops.length > OUTBOX_MAX_OPS) ops = await enforceCap(ops);
  write(ops);
}

/**
 * Always queues, never attempts a direct online round trip first — unlike
 * `queueWrite`'s online fast path, which fires the request straight away and
 * loses it for good if the tab closes/reloads before the response lands
 * (the browser aborts the in-flight `fetch`, and nothing was ever persisted
 * to replay it). For a write that must survive that (payment completion —
 * see store.ts `completePayment`), this pays a trivial localStorage
 * read/write up front so the op is durable from the very first synchronous
 * instant, then lets the normal `flushOutbox` machinery send it — same
 * retry/failure surface (`subscribeOutbox`) as every other queued write.
 * Returns the op id so the caller can watch it resolve via `subscribeOutbox`.
 */
export async function enqueueWrite(input: Omit<WriteOp, 'id' | 'at'>): Promise<string> {
  const op: WriteOp = { ...input, id: crypto.randomUUID(), at: new Date().toISOString() };
  await enqueue(op);
  void flushOutbox();
  return op.id;
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
    await enqueue(op);
    void flushOutbox();
    return { error: null, queued: true };
  }

  markInFlight(op.resource);
  const { error } = await execute(op).finally(() => unmarkInFlight(op.resource));
  if (error && isTransient(error)) {
    await enqueue(op);
    return { error: null, queued: true };
  }
  if (error) console.warn(`[cloud-sync] ${op.label ?? op.table}.${op.action} failed: ${error.message}`);
  return { error };
}

let flushing = false;

/** Replay every queued operation in order. Stops at the first transient failure. */
export async function flushOutbox(): Promise<void> {
  // Corre mesmo offline — é precisamente o dispositivo offline há muito
  // tempo que precisa desta purga, e só corre quando a app está aberta de
  // qualquer forma (chamado pelo intervalo/eventos de startOutbox).
  await purgeStaleOps();
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
  // 10s (não 30s) — a fila deixava a impressão de "presa" numa ligação
  // instável que se recupera e falha em ciclos curtos; um intervalo mais
  // curto limita quanto tempo uma escrita pendente fica visível como
  // "a sincronizar" antes da próxima tentativa.
  setInterval(() => { void flushOutbox(); }, 10_000);
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
