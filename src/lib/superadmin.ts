import { accountStore } from './accounts';

// Email fixo do super-admin (dono da plataforma).
// A password é definida na primeira execução em /admin/setup (ou no primeiro login).
export const SUPERADMIN_EMAIL = 'admin@saborposystem.mz';
export const SUPERADMIN_TENANT_ID = 'platform';
const INIT_KEY = 'superadmin_initialized';

export function isSuperAdminInitialized(): boolean {
  return !!localStorage.getItem(INIT_KEY) && !!accountStore.getByEmail(SUPERADMIN_EMAIL);
}

export async function initializeSuperAdmin(password: string, name = 'Super Admin') {
  const existing = accountStore.getByEmail(SUPERADMIN_EMAIL);
  if (existing) {
    await accountStore.updatePassword(existing.id, password);
  } else {
    await accountStore.create({
      tenantId: SUPERADMIN_TENANT_ID,
      email: SUPERADMIN_EMAIL,
      password,
      name,
      role: 'superadmin',
    });
  }
  localStorage.setItem(INIT_KEY, '1');
}
