import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/types/restaurant';
import { hasPermission as checkPermission, fetchStaffPermissions, type Permission } from '@/lib/permissions';
import { fetchSettings } from '@/lib/settings';
import { fetchLoyaltySettings } from '@/lib/loyaltySettings';
import { fetchPaymentAccounts } from '@/lib/paymentAccounts';
import { fetchStripeConfig } from '@/lib/billing';
import { fetchTenantCatalog } from '@/lib/store';

interface SessionUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  username?: string;
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
  signUp: (input: { email?: string; username?: string; password: string; name: string; phone?: string; restaurantName: string }) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
  hasPermission: (p: Permission) => boolean;
  switchTenant: (tenantId: string) => void;
  refreshProfile: () => Promise<void>;
  // Legacy stub — PIN auth is being replaced by per-staff Supabase accounts.
  loginWithPin: (pin: string) => { ok: boolean; error?: string };
  /**
   * Bumped once the background tenant-catalog prefetch (orders, tables,
   * menu, etc. — see hydrate() below) finishes. `loading` flips to false as
   * soon as the user profile loads, deliberately NOT waiting on this
   * catalog fetch so the shell renders fast — but that means a page that
   * mounts in that window (e.g. right after cy.visit()/a fresh load) can
   * read localStorage before the catalog has landed, with nothing to tell
   * it to re-read once it does. useRestaurant() depends on this to trigger
   * that re-read.
   */
  catalogVersion: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CURRENT_TENANT_KEY = 'current_tenant_id';

async function loadSessionUser(authUser: User): Promise<SessionUser | null> {
  // Fetch profile, roles and memberships in parallel.
  const [{ data: profile }, { data: roles }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('name, email, phone, username').eq('id', authUser.id).maybeSingle(),
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
    username: profile?.username ?? undefined,
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
  const [catalogVersion, setCatalogVersion] = useState(0);

  const hydrate = useCallback(async (s: Session | null) => {
    if (!s?.user) { setUser(null); return; }
    try {
      const u = await loadSessionUser(s.user);
      setUser(u);
      if (u?.tenantId) {
        // Prefetch tenant-scoped caches in parallel; failures fall back to
        // defaults. Deliberately not awaited so `loading` (and therefore
        // the app shell) doesn't block on it — but pages that read the
        // catalog from localStorage (useRestaurant) need to know when it
        // lands, hence catalogVersion.
        void Promise.all([
          fetchSettings(u.tenantId).catch(() => { }),
          fetchLoyaltySettings(u.tenantId).catch(() => { }),
          fetchStaffPermissions(u.tenantId).catch(() => { }),
          fetchPaymentAccounts().catch(() => { }),
          fetchStripeConfig().catch(() => { }),
          fetchTenantCatalog(u.tenantId),
        ]).then(() => setCatalogVersion(v => v + 1));
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

  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    // `identifier` may be an email OR a username — Supabase Auth only knows
    // email, so usernames are resolved server-side first (SECURITY DEFINER
    // RPC; profiles isn't publicly readable).
    let email = identifier.trim();
    if (!email.includes('@')) {
      const { data: resolved, error: resolveErr } = await supabase.rpc('resolve_login_email', { identifier: email });
      if (resolveErr || !resolved) return { ok: false, error: 'Utilizador não encontrado' };
      email = resolved as string;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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

  const signUp = useCallback(async (input: { email?: string; username?: string; password: string; name: string; phone?: string; restaurantName: string }) => {
    // Supabase Auth only stores an email, so a username-only signup gets a
    // synthetic placeholder email (never shown to the user, never emailed);
    // its local-part is the chosen username so bootstrap-tenant's
    // email-prefix-as-username fallback recovers it automatically. The
    // domain has to be a real, DNS-resolvable one — GoTrue rejects made-up
    // domains as "invalid" (confirmed: users.saborpos.app doesn't exist and
    // was bouncing every username-only signup).
    const username = input.username?.trim().toLowerCase();
    const authEmail = input.email?.trim() || `${username}@users.jsetra.com`;
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { name: input.name, phone: input.phone },
      },
    });
    if (error) {
      if (!input.email && /registered|exists/i.test(error.message)) {
        return { ok: false, error: 'Username já está em uso' };
      }
      return { ok: false, error: error.message };
    }
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
    user, session, loading, catalogVersion,
    loginWithPassword, signInWithGoogle, signUp, logout,
    hasRole, hasPermission, switchTenant, refreshProfile, loginWithPin,
  }), [user, session, loading, catalogVersion, loginWithPassword, signInWithGoogle, signUp, logout, hasRole, hasPermission, switchTenant, refreshProfile, loginWithPin]);

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
  // '/billing' e '/pricing' saíram daqui de propósito: App.tsx redirecciona-as
  // sempre para "/" (facturação ainda não está pronta para produção), antes
  // sequer de chegarem ao RequireAuth — mantê-las aqui seria código morto.
  '/onboarding': ['admin'],
  '/admin': ['superadmin'],
};
