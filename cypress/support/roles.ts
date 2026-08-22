export type Role = 'superadmin' | 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  /** null para superadmin (papel de plataforma, sem tenant) */
  tenantId: string | null;
}

// Um utilizador fixo por papel — reutilizado em toda a suite. IDs e emails
// são todos fictícios; nada disto aponta para um Supabase real.
export const USERS: Record<Role, TestUser> = {
  superadmin: {
    id: '00000000-0000-0000-0000-00000000a001',
    email: 'super@teste.mz', username: 'super_admin', password: 'SenhaForte123!',
    name: 'Super Admin', role: 'superadmin', tenantId: null,
  },
  admin: {
    id: '00000000-0000-0000-0000-00000000a002',
    email: 'admin@teste.mz', username: 'admin_teste', password: 'SenhaForte123!',
    name: 'Dono do Restaurante', role: 'admin', tenantId: TENANT_ID,
  },
  manager: {
    id: '00000000-0000-0000-0000-00000000a003',
    email: 'gerente@teste.mz', username: 'gerente_teste', password: 'SenhaForte123!',
    name: 'Gerente Teste', role: 'manager', tenantId: TENANT_ID,
  },
  cashier: {
    id: '00000000-0000-0000-0000-00000000a004',
    email: 'caixa@teste.mz', username: 'caixa_teste', password: 'SenhaForte123!',
    name: 'Caixa Teste', role: 'cashier', tenantId: TENANT_ID,
  },
  waiter: {
    id: '00000000-0000-0000-0000-00000000a005',
    email: 'garcom@teste.mz', username: 'garcom_teste', password: 'SenhaForte123!',
    name: 'Garçom Teste', role: 'waiter', tenantId: TENANT_ID,
  },
  kitchen: {
    id: '00000000-0000-0000-0000-00000000a006',
    email: 'cozinha@teste.mz', username: 'cozinha_teste', password: 'SenhaForte123!',
    name: 'Cozinha Teste', role: 'kitchen', tenantId: TENANT_ID,
  },
};

export const ALL_ROLES: Role[] = ['superadmin', 'admin', 'manager', 'cashier', 'waiter', 'kitchen'];
export const TENANT_ROLES: Role[] = ['admin', 'manager', 'cashier', 'waiter', 'kitchen'];

/** Para onde o LoginPage redirecciona cada papel (ROLE_HOME em LoginPage.tsx). */
export const ROLE_HOME: Record<Role, string> = {
  superadmin: '/admin',
  admin: '/',
  manager: '/',
  cashier: '/pos',
  waiter: '/tables',
  kitchen: '/kitchen',
};

/** Espelha ROUTE_PERMISSIONS em AuthContext.tsx — mantido em sincronia manualmente. */
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/': ['admin', 'manager'],
  '/menu': ['admin', 'manager', 'waiter', 'cashier', 'kitchen'],
  '/tables': ['admin', 'manager', 'waiter', 'cashier'],
  '/kitchen': ['admin', 'manager', 'kitchen', 'waiter'],
  '/pos': ['admin', 'manager', 'cashier', 'waiter'],
  '/inventory': ['admin', 'manager'],
  '/reports': ['admin', 'manager'],
  '/settings': ['admin'],
  '/staff': ['admin', 'manager'],
  '/customers': ['admin', 'manager', 'cashier', 'waiter'],
  '/shifts': ['admin', 'manager', 'cashier', 'waiter', 'kitchen'],
  // Salários e outras despesas são sensíveis — exclusivo do admin (ver
  // staff_salaries/expenses no schema, RLS admin-only).
  '/expenses': ['admin'],
  // Relatório anual + limpeza de dados antigos — mesmo âmbito sensível
  // que '/expenses' (apaga dados definitivamente).
  '/data-archive': ['admin'],
  // '/billing' e '/pricing' saíram daqui de propósito — ver AuthContext.tsx.
  '/onboarding': ['admin'],
  '/admin': ['superadmin'],
};
