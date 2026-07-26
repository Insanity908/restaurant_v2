import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/types/restaurant';
import { hasPermission as checkPermission, fetchStaffPermissions, type Permission } from '@/lib/permissions';
import { fetchSettings } from '@/lib/settings';
import { fetchLoyaltySettings } from '@/lib/loyaltySettings';
import { fetchPaymentAccounts } from '@/lib/paymentAccounts';
import { fetchTenantCatalog } from '@/lib/store';

interface SessionUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  tenantId?: string;
  tenantIds: string[];
}

interface AuthContextValue {
  user: SessionUser | null;
  session: Session | null;
  loading: boolean;
  loginWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signUp: (input: { email: string; password: string; name: string; phone?: string; restaurantName: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  hasPermission: (p: Permission) => boolean;
  switchTenant: (tenantId: string) => void;
  refreshProfile: () => Promise<void>;
  // Legacy stub — PIN auth is being replaced by per-staff Supabase accounts.
  loginWithPin: (pin: string) => { ok: boolean; error?: string };
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CURRENT_TENANT_KEY = 'current_tenant_id';

async function loadSessionUser(authUser: User): Promise<SessionUser | null> {
  // Fetch profile, roles and memberships in parallel.
  const [{ data: profile }, { data: roles }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('name, email, phone').eq('id', authUser.id).maybeSingle(),
    supabase.from('user_roles').select('role, tenant_id').eq('user_id', authUser.id),
    supabase.from('tenant_members').select('tenant_id').eq('user_id', authUser.id),
  ]);

  const isSuper = (roles ?? []).some(r => r.role === 'superadmin');
  const tenantIds = Array.from(new Set((members ?? []).map(m => m.tenant_id)));

  // Determine current tenant.
  let currentTenant = localStorage.getItem(CURRENT_TENANT_KEY);
  if (!currentTenant || !tenantIds.includes(currentTenant)) {
    currentTenant = tenantIds[0] ?? null;
    if (currentTenant) localStorage.setItem(CURRENT_TENANT_KEY, currentTenant);
    else localStorage.removeItem(CURRENT_TENANT_KEY);
  }

  // Determine role for the active tenant.
  let role: UserRole | null = null;
  if (isSuper) role = 'superadmin';
  else if (currentTenant) {
    const match = (roles ?? []).find(r => r.tenant_id === currentTenant);
    role = (match?.role as UserRole | undefined) ?? null;
  }
  if (!role) {
    // No role yet — likely mid-bootstrap. Default to admin only if member exists.
    role = currentTenant ? 'admin' : (isSuper ? 'superadmin' : 'admin');
  }

  return {
    id: authUser.id,
    authUserId: authUser.id,
    email: profile?.email ?? authUser.email ?? '',
    name: profile?.name ?? authUser.user_metadata?.name ?? authUser.email ?? '',
    phone: profile?.phone ?? undefined,
    role,
    tenantId: currentTenant ?? undefined,
    tenantIds,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (s: Session | null) => {
    if (!s?.user) { setUser(null); return; }
    try {
      const u = await loadSessionUser(s.user);
      setUser(u);
      if (u?.tenantId) {
        // Prefetch tenant-scoped caches in parallel; failures fall back to defaults.
        void Promise.all([
          fetchSettings(u.tenantId).catch(() => { }),
          fetchLoyaltySettings(u.tenantId).catch(() => { }),
          fetchStaffPermissions(u.tenantId).catch(() => { }),
          fetchPaymentAccounts().catch(() => { }),
          fetchTenantCatalog(u.tenantId),
        ]);
      }
    } catch (e) {
      console.error('Failed to load session user', e);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Register listener FIRST, then read the current session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer non-supabase calls to avoid deadlocks.
      setTimeout(() => { hydrate(s); }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      hydrate(data.session).finally(() => setLoading(false));
    });

    return () => { sub.subscription.unsubscribe(); };
  }, [hydrate]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin, // ou uma URL específica, ex: `${window.location.origin}/auth/callback`
        queryParams: {
          prompt: 'select_account',
          // outros parâmetros, ex: access_type: 'offline'
        },
      },
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }, []);

  const signUp = useCallback(async (input: { email: string; password: string; name: string; phone?: string; restaurantName: string }) => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name: input.name, phone: input.phone },
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data.session) {
      // Email confirmation required (unlikely because auto_confirm is on).
      return { ok: false, error: 'Verifique o seu email para confirmar a conta.' };
    }
    // Provision tenant + admin role + trial.
    const { error: fnError } = await supabase.functions.invoke('bootstrap-tenant', {
      body: {
        restaurantName: input.restaurantName,
        ownerName: input.name,
        ownerPhone: input.phone,
      },
    });
    if (fnError) return { ok: false, error: `Conta criada mas falhou provisionar restaurante: ${fnError.message}` };
    // Re-hydrate to pick up new tenant + role.
    const { data: freshSession } = await supabase.auth.getSession();
    await hydrate(freshSession.session);
    return { ok: true };
  }, [hydrate]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(CURRENT_TENANT_KEY);
    setUser(null);
    setSession(null);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => !!user && roles.includes(user.role),
    [user],
  );

  const hasPermission = useCallback(
    (p: Permission) => checkPermission(user, p),
    [user],
  );

  const switchTenant = useCallback((tenantId: string) => {
    if (!user?.tenantIds.includes(tenantId)) return;
    localStorage.setItem(CURRENT_TENANT_KEY, tenantId);
    window.location.reload();
  }, [user]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session);
  }, [hydrate]);

  const loginWithPin = useCallback((_pin: string) => {
    return { ok: false, error: 'Login por PIN foi descontinuado. Use o seu email e password.' };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, session, loading,
    loginWithPassword, signInWithGoogle, signUp, logout,
    hasRole, hasPermission, switchTenant, refreshProfile, loginWithPin,
  }), [user, session, loading, loginWithPassword, signInWithGoogle, signUp, logout, hasRole, hasPermission, switchTenant, refreshProfile, loginWithPin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
  '/settings': ['admin'],
  '/staff': ['admin', 'manager'],
  '/customers': ['admin', 'manager', 'cashier', 'waiter'],
  '/shifts': ['admin', 'manager', 'cashier', 'waiter', 'kitchen'],
  '/billing': ['admin'],
  '/pricing': ['admin'],
  '/onboarding': ['admin'],
  '/admin': ['superadmin'],
};
