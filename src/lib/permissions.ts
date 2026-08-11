import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';
import type { UserRole } from '@/types/restaurant';

export type Permission =
  | 'menu.view' | 'menu.edit'
  | 'inventory.view' | 'inventory.edit'
  | 'pos.use' | 'pos.discount' | 'pos.refund'
  | 'reports.view' | 'reports.financial'
  | 'staff.view' | 'staff.manage'
  | 'customers.view' | 'customers.edit'
  | 'shifts.view' | 'shifts.manage'
  | 'settings.edit'
  | 'billing.manage'
  | 'tables.view' | 'kitchen.view'
  | 'proforma.print';

export const ALL_PERMISSIONS: Permission[] = [
  'menu.view', 'menu.edit',
  'inventory.view', 'inventory.edit',
  'pos.use', 'pos.discount', 'pos.refund',
  'reports.view', 'reports.financial',
  'staff.view', 'staff.manage',
  'customers.view', 'customers.edit',
  'shifts.view', 'shifts.manage',
  'settings.edit',
  'billing.manage',
  'tables.view', 'kitchen.view',
  'proforma.print',
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'menu.view': 'Ver cardápio',
  'menu.edit': 'Editar cardápio',
  'inventory.view': 'Ver inventário',
  'inventory.edit': 'Editar inventário',
  'pos.use': 'Usar POS',
  'pos.discount': 'Aplicar descontos',
  'pos.refund': 'Reembolsos',
  'reports.view': 'Ver relatórios',
  'reports.financial': 'Relatórios financeiros',
  'staff.view': 'Ver equipa',
  'staff.manage': 'Gerir equipa',
  'customers.view': 'Ver clientes',
  'customers.edit': 'Editar clientes',
  'shifts.view': 'Ver turnos',
  'shifts.manage': 'Gerir turnos',
  'settings.edit': 'Editar configurações',
  'billing.manage': 'Gerir faturação',
  'tables.view': 'Ver mesas',
  'kitchen.view': 'Ver cozinha',
  'proforma.print': 'Imprimir fatura proforma',
};

export const DEFAULT_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [...ALL_PERMISSIONS],
  admin: [...ALL_PERMISSIONS],
  manager: [
    'menu.view', 'menu.edit',
    'inventory.view', 'inventory.edit',
    'pos.use', 'pos.discount',
    'reports.view',
    'staff.view', 'staff.manage',
    'customers.view', 'customers.edit',
    'shifts.view', 'shifts.manage',
    'tables.view', 'kitchen.view',
    'proforma.print',
  ],
  cashier: [
    'menu.view', 'pos.use', 'pos.discount',
    'customers.view', 'customers.edit',
    'tables.view', 'shifts.view',
  ],
  waiter: [
    'menu.view', 'pos.use',
    'customers.view', 'customers.edit',
    'tables.view', 'kitchen.view', 'shifts.view',
  ],
  kitchen: [
    'menu.view', 'kitchen.view', 'shifts.view',
  ],
};

// In-memory cache: `${tenantId}:${staffId}` -> Permission[]
const memCache = new Map<string, Permission[]>();

function ckey(tenantId: string, staffId: string) { return `${tenantId}:${staffId}`; }

function activeTenantId(): string | null {
  return localStorage.getItem('current_tenant_id');
}

/** Sync read from cache. Returns role defaults if not overridden. */
export function getStaffPermissions(staffId: string, role: UserRole): Permission[] {
  const tid = activeTenantId();
  if (tid) {
    const cached = memCache.get(ckey(tid, staffId));
    if (cached) return cached;
  }
  return DEFAULT_PERMISSIONS[role] ?? [];
}

/** Async override for a given staff in the active tenant. */
export async function setStaffPermissions(staffId: string, perms: Permission[]): Promise<void> {
  const tid = activeTenantId();
  if (!tid) throw new Error('Sem restaurante ativo');
  memCache.set(ckey(tid, staffId), perms);
  const { error } = await cloud('staff_permissions')
    .upsert({ tenant_id: tid, staff_id: staffId, permissions: perms }, { onConflict: 'tenant_id,staff_id' });
  if (error) throw new Error(error.message);
}

/** Clear override — role default resumes. */
export async function resetStaffPermissions(staffId: string): Promise<void> {
  const tid = activeTenantId();
  if (!tid) return;
  memCache.delete(ckey(tid, staffId));
  const { error } = await cloud('staff_permissions')
    .delete()
    .eq('tenant_id', tid)
    .eq('staff_id', staffId);
  if (error) throw new Error(error.message);
}

/** Fetch all overrides for a tenant into the cache. */
export async function fetchStaffPermissions(tenantId: string): Promise<void> {
  const { data, error } = await supabase
    .from('staff_permissions')
    .select('staff_id, permissions')
    .eq('tenant_id', tenantId);
  if (error) { console.warn('fetchStaffPermissions failed', error.message); return; }
  // Drop stale entries for this tenant.
  for (const key of Array.from(memCache.keys())) {
    if (key.startsWith(`${tenantId}:`)) memCache.delete(key);
  }
  for (const row of data ?? []) {
    memCache.set(ckey(tenantId, row.staff_id), (row.permissions ?? []) as Permission[]);
  }
}

/** Limpa todas as permissões em memória (logout / troca de conta). */
export function clearPermissionsCache(): void {
  memCache.clear();
}

export function hasPermission(user: { id: string; role: UserRole } | null, perm: Permission): boolean {
  if (!user) return false;
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  return getStaffPermissions(user.id, user.role).includes(perm);
}
