import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Staff, UserRole, Account } from '@/types/restaurant';
import { staffStore, seedData } from '@/lib/store';
import { accountStore } from '@/lib/accounts';
import { tenantStore } from '@/lib/tenants';

interface SessionUser extends Staff {
  accountId?: string;
  tenantId?: string;
  email?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  loginWithPin: (pin: string) => { ok: boolean; error?: string };
  loginWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'auth_user_id';
const SESSION_KIND = 'auth_session_kind'; // 'staff' | 'account'

function accountToUser(acc: Account): SessionUser {
  return {
    id: acc.id,
    accountId: acc.id,
    tenantId: acc.tenantId,
    email: acc.email,
    name: acc.name,
    role: acc.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedData();
    const kind = localStorage.getItem(SESSION_KIND);
    if (kind === 'account') {
      const acc = accountStore.current();
      if (acc) {
        setUser(accountToUser(acc));
        if (acc.role === 'manager') tenantStore.setCurrent(acc.tenantId);
      }
    } else {
      const id = localStorage.getItem(STORAGE_KEY);
      if (id) {
        const found = staffStore.getAll().find(s => s.id === id) || null;
        setUser(found);
      }
    }
    setLoading(false);
  }, []);

  const loginWithPin = useCallback((pin: string) => {
    const found = staffStore.findByPin(pin);
    if (!found) return { ok: false, error: 'PIN inválido' };
    localStorage.setItem(STORAGE_KEY, found.id);
    localStorage.setItem(SESSION_KIND, 'staff');
    setUser(found);
    return { ok: true };
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const acc = await accountStore.login(email, password);
      localStorage.setItem(SESSION_KIND, 'account');
      localStorage.removeItem(STORAGE_KEY);
      if (acc.role === 'manager') tenantStore.setCurrent(acc.tenantId);
      else tenantStore.setCurrent(null);
      setUser(accountToUser(acc));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erro' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KIND);
    accountStore.setCurrent(null);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPin, loginWithPassword, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/': ['admin', 'manager'],
  '/menu': ['admin', 'manager', 'waiter', 'cashier'],
  '/tables': ['admin', 'manager', 'waiter', 'cashier'],
  '/kitchen': ['admin', 'manager', 'kitchen', 'waiter', 'cashier'],
  '/pos': ['admin', 'manager', 'cashier', 'waiter'],
  '/inventory': ['admin', 'manager'],
  '/reports': ['admin', 'manager'],
  '/settings': ['admin', 'manager'],
  '/staff': ['admin', 'manager'],
  '/customers': ['admin', 'manager', 'cashier', 'waiter'],
  '/shifts': ['admin', 'manager', 'cashier', 'waiter', 'kitchen'],
  '/billing': ['admin', 'manager'],
  '/pricing': ['admin', 'manager'],
  '/onboarding': ['admin', 'manager'],
  '/admin': ['superadmin'],
};
