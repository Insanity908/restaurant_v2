/**
 * Despesas fixas (água, energia, outras) e salários da equipe — usados no
 * cálculo de lucro líquido em Relatórios (ver ReportsPage). Ambos são
 * exclusivos do admin: rota /expenses só é navegável por admin
 * (ROUTE_PERMISSIONS) e reforçado aqui via RLS nas tabelas `expenses` e
 * `staff_salaries`, porque salário é sensível e a tabela `staff` (onde
 * vivem nome/papel) já é legível por gerentes — RLS é por linha, não por
 * coluna, por isso o salário precisa da sua própria tabela.
 */
import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';
import { tenantScopedKey } from './localCache';
import type { Expense } from '@/types/restaurant';

const EXPENSES_KEY = 'expenses';
const SALARIES_KEY = 'staff_salaries';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function tenantId(): string | null { return localStorage.getItem('current_tenant_id'); }
function warn(op: string, err: { message: string } | null) { if (err) console.warn(`[cloud-sync] ${op} failed: ${err.message}`); }

// -- Despesas fixas (água, energia, outras) -----------------------------------

function getExpensesLocal(): Expense[] {
  try {
    const raw = localStorage.getItem(tenantScopedKey(EXPENSES_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function setExpensesLocal(items: Expense[]) {
  localStorage.setItem(tenantScopedKey(EXPENSES_KEY), JSON.stringify(items));
}

/** Regista o valor actual no histórico (usado por Relatórios para reconstruir
 *  "qual era o valor no fim deste período" sem reescrever meses já fechados). */
function recordExpenseAmountHistory(expenseId: string, tenantId: string, amount: number) {
  void cloud('expense_amount_history').insert({ expense_id: expenseId, tenant_id: tenantId, amount })
    .then(({ error }) => warn('expenses.history.insert', error));
}

export const expenseStore = {
  getAll: getExpensesLocal,
  add: (item: Omit<Expense, 'id' | 'createdAt'>): Expense => {
    const all = getExpensesLocal();
    const created: Expense = { ...item, id: generateId(), createdAt: new Date().toISOString() };
    all.push(created);
    setExpensesLocal(all);
    const t = tenantId();
    if (t && isUuid(created.id)) {
      void cloud('expenses').insert({
        id: created.id, tenant_id: t, name: created.name, category: created.category, amount: created.amount,
        recurring: created.recurring, expense_date: created.recurring ? null : (created.expenseDate ?? null),
      }).then(({ error }) => {
        warn('expenses.insert', error);
        // Ponto inicial do histórico — sem isto, reconstruir o valor de
        // períodos antes da primeira edição não teria onde procurar.
        if (!error && created.recurring) recordExpenseAmountHistory(created.id, t, created.amount);
      });
    }
    return created;
  },
  update: (id: string, updates: Partial<Expense>) => {
    const all = getExpensesLocal();
    const idx = all.findIndex(e => e.id === id);
    const prevRecurring = all[idx]?.recurring;
    if (idx !== -1) { all[idx] = { ...all[idx], ...updates }; setExpensesLocal(all); }
    const t = tenantId();
    if (t && isUuid(id)) {
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.category !== undefined) row.category = updates.category;
      if (updates.amount !== undefined) row.amount = updates.amount;
      if (updates.recurring !== undefined) row.recurring = updates.recurring;
      if (updates.expenseDate !== undefined) row.expense_date = updates.expenseDate || null;
      if (Object.keys(row).length) {
        void cloud('expenses').update(row as never).eq('id', id).eq('tenant_id', t)
          .then(({ error }) => {
            warn('expenses.update', error);
            const isRecurring = updates.recurring ?? prevRecurring;
            if (!error && updates.amount !== undefined && isRecurring) {
              recordExpenseAmountHistory(id, t, updates.amount as number);
            }
          });
      }
    }
    return all[idx];
  },
  /** Arquiva em vez de apagar — apagar destruiria relatórios de períodos
   *  passados que já contavam com esta despesa (ver migration de histórico). */
  remove: (id: string) => {
    setExpensesLocal(getExpensesLocal().filter(e => e.id !== id));
    const t = tenantId();
    if (t && isUuid(id)) {
      void cloud('expenses').update({ archived_at: new Date().toISOString() } as never).eq('id', id).eq('tenant_id', t)
        .then(({ error }) => warn('expenses.archive', error));
    }
  },
};

export async function fetchExpenses(t: string): Promise<Expense[]> {
  const { data, error } = await supabase.from('expenses').select('*').eq('tenant_id', t).is('archived_at', null);
  if (error) { warn('expenses.fetch', error); return getExpensesLocal(); }
  const rows: Expense[] = (data ?? []).map(r => ({
    id: r.id, name: r.name, category: r.category as Expense['category'],
    amount: Number(r.amount), recurring: r.recurring, expenseDate: r.expense_date ?? undefined, createdAt: r.created_at,
  }));
  setExpensesLocal(rows);
  return rows;
}

export interface PeriodFixedCosts { recurringMonthly: number; oneTime: number }

/**
 * Custos fixos (despesas recorrentes + salários) tal como estavam no fim de
 * `end`, mais despesas pontuais cuja data cai em [start, end] — em vez do
 * valor de hoje. Sem isto, editar um salário/despesa hoje reescrevia
 * silenciosamente o lucro de meses já fechados em Relatórios.
 */
export async function fetchFixedCosts(t: string, range: { start: Date | null; end: Date }): Promise<PeriodFixedCosts> {
  const [expRes, histRes, salRes] = await Promise.all([
    supabase.from('expenses').select('*').eq('tenant_id', t),
    supabase.from('expense_amount_history').select('expense_id, amount, created_at').eq('tenant_id', t).order('created_at', { ascending: true }),
    supabase.from('staff_salaries').select('staff_id, salary, created_at').eq('tenant_id', t).order('created_at', { ascending: true }),
  ]);
  if (expRes.error || histRes.error || salRes.error) {
    warn('fixedCosts.fetch', expRes.error || histRes.error || salRes.error);
    return { recurringMonthly: 0, oneTime: 0 };
  }

  const historyByExpense = new Map<string, { amount: number; createdAt: string }[]>();
  (histRes.data ?? []).forEach(r => {
    const list = historyByExpense.get(r.expense_id) ?? [];
    list.push({ amount: Number(r.amount), createdAt: r.created_at });
    historyByExpense.set(r.expense_id, list);
  });

  const asOf = range.end;
  let recurringMonthly = 0;
  let oneTime = 0;

  (expRes.data ?? []).forEach(row => {
    if (new Date(row.created_at) > asOf) return; // ainda não existia
    if (row.recurring) {
      if (row.archived_at && new Date(row.archived_at) <= asOf) return; // já tinha sido removida
      const hist = historyByExpense.get(row.id) ?? [];
      const atPeriod = [...hist].reverse().find(h => new Date(h.createdAt) <= asOf);
      recurringMonthly += atPeriod ? atPeriod.amount : Number(row.amount);
    } else if (row.expense_date) {
      const d = new Date(row.expense_date);
      if (range.start && d < range.start) return;
      if (d > range.end) return;
      oneTime += Number(row.amount);
    }
  });

  const latestByStaff = new Map<string, { salary: number; createdAt: string }>();
  (salRes.data ?? []).forEach(r => {
    if (new Date(r.created_at) > asOf) return;
    const cur = latestByStaff.get(r.staff_id);
    if (!cur || new Date(r.created_at) > new Date(cur.createdAt)) {
      latestByStaff.set(r.staff_id, { salary: Number(r.salary), createdAt: r.created_at });
    }
  });
  latestByStaff.forEach(v => { recurringMonthly += v.salary; });

  return { recurringMonthly, oneTime };
}

// -- Salários da equipe (admin-only; ver staff_salaries no schema) -----------

function getSalariesLocal(): Record<string, number> {
  try {
    const raw = localStorage.getItem(tenantScopedKey(SALARIES_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function setSalariesLocal(map: Record<string, number>) {
  localStorage.setItem(tenantScopedKey(SALARIES_KEY), JSON.stringify(map));
}

/** Sync read from cache: staffId -> salário mensal (MT). */
export function getStaffSalaries(): Record<string, number> {
  return getSalariesLocal();
}

/** staff_salaries é histórico append-only (sem PK em tenant_id+staff_id, sem
 *  grant de UPDATE) — lê-se a linha mais recente por staff em vez do "actual". */
export async function fetchStaffSalaries(t: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('staff_salaries')
    .select('staff_id, salary, created_at').eq('tenant_id', t).order('created_at', { ascending: false });
  if (error) { warn('salaries.fetch', error); return getSalariesLocal(); }
  const map: Record<string, number> = {};
  (data ?? []).forEach(r => { if (!(r.staff_id in map)) map[r.staff_id] = Number(r.salary); });
  setSalariesLocal(map);
  return map;
}

/** Cada "Guardar" insere uma linha nova (nunca update) — ver schema. */
export async function saveStaffSalary(staffId: string, salary: number): Promise<void> {
  const map = getSalariesLocal();
  map[staffId] = salary;
  setSalariesLocal(map);
  const t = tenantId();
  if (!t) return;
  const { error } = await cloud('staff_salaries').insert({ tenant_id: t, staff_id: staffId, salary });
  if (error) warn('salaries.save', error);
}
