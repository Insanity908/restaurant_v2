import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Staff, UserRole } from '@/types/restaurant';
import { staffStore, seedData } from '@/lib/store';

interface AuthContextValue {
  user: Staff | null;
  loading: boolean;
  loginWithPin: (pin: string) => { ok: boolean; error?: string };
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = 'auth_user_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedData();
    const id = localStorage.getItem(STORAGE_KEY);
    if (id) {
      const found = staffStore.getAll().find(s => s.id === id) || null;
      setUser(found);
    }
    setLoading(false);
  }, []);

  const loginWithPin = useCallback((pin: string) => {
    const found = staffStore.findByPin(pin);
    if (!found) return { ok: false, error: 'PIN inválido' };
    localStorage.setItem(STORAGE_KEY, found.id);
    setUser(found);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPin, logout, hasRole }}>
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

// Permissions matrix — which roles can access which routes
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
  '/shifts': ['admin', 'manager', 'cashier', 'waiter', 'kitchen'],
};
