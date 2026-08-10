/**
 * One-time migration of legacy (pre-cloud) localStorage data into the backend.
 *
 * Legacy data lives in *unscoped* keys (`menu_items`, `tables`, ...) written by
 * the app before multi-tenant/cloud support. Once imported for a tenant we set
 * a marker so the migration screen never runs again on this device.
 */
import { supabase } from '@/integrations/supabase/client';

const LEGACY_KEYS = ['menu_items', 'tables', 'inventory', 'customers', 'staff'] as const;

const doneKey = (tenantId: string) => `legacy_import_done__${tenantId}`;

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isLegacyImportDone(tenantId: string): boolean {
  return localStorage.getItem(doneKey(tenantId)) === '1';
}

export function markLegacyImportDone(tenantId: string) {
  localStorage.setItem(doneKey(tenantId), '1');
}

/** Legacy payload found on this device, or null when there is nothing to migrate. */
export function collectLegacyData() {
  const menuItems = readArray<Record<string, unknown>>('menu_items');
  const tables = readArray<Record<string, unknown>>('tables');
  const inventory = readArray<Record<string, unknown>>('inventory');
  const customers = readArray<Record<string, unknown>>('customers');
  const staff = readArray<Record<string, unknown>>('staff');
  const total = menuItems.length + tables.length + inventory.length + customers.length + staff.length;
  if (total === 0) return null;
  return { menuItems, tables, inventory, customers, staff, total };
}

export function hasLegacyData(tenantId: string): boolean {
  return !isLegacyImportDone(tenantId) && collectLegacyData() !== null;
}

/** Remove the legacy unscoped keys after a successful import. */
export function clearLegacyData() {
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('sync_queue');
  localStorage.removeItem('accounts');
  localStorage.removeItem('account_session_id');
  localStorage.removeItem('superadmin_initialized');
}

export async function runLegacyImport(tenantId: string): Promise<{ ok: boolean; imported?: Record<string, number>; error?: string }> {
  const legacy = collectLegacyData();
  if (!legacy) {
    markLegacyImportDone(tenantId);
    return { ok: true, imported: {} };
  }
  const { data, error } = await supabase.functions.invoke('import-legacy', {
    body: {
      tenantId,
      data: {
        menuItems: legacy.menuItems,
        tables: legacy.tables,
        inventory: legacy.inventory,
        customers: legacy.customers,
        staff: legacy.staff,
      },
    },
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; imported?: Record<string, number>; error?: string };
  if (!result?.ok) return { ok: false, error: result?.error ?? 'Falha na migração' };
  markLegacyImportDone(tenantId);
  clearLegacyData();
  return { ok: true, imported: result.imported };
}
