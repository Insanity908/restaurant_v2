import { useEffect, useState, useCallback } from 'react';
import { tenantStore, fetchTenant, refreshSubscription } from '@/lib/tenants';
import { Tenant } from '@/types/restaurant';

export function useLicense() {
  const [tenant, setTenant] = useState<Tenant | null>(() => tenantStore.current());

  const refresh = useCallback(() => setTenant(tenantStore.current()), []);

  /** Ask the backend to re-evaluate the licence and refresh the local cache. */
  const syncFromServer = useCallback(async () => {
    const id = tenantStore.current()?.id ?? localStorage.getItem('current_tenant_id');
    if (!id) return;
    const res = await refreshSubscription(id).catch(() => null);
    if (res?.tenant) setTenant(res.tenant);
    else {
      const t = await fetchTenant(id).catch(() => null);
      if (t) setTenant(t);
    }
  }, []);

  useEffect(() => {
    refresh();
    void syncFromServer();
    const id = setInterval(() => { void syncFromServer(); }, 5 * 60 * 1000);
    const onStorage = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void syncFromServer(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, syncFromServer]);

  const status = tenant?.subscription.status ?? null;
  const isActive = status === 'active' || status === 'trial';
  // Temporariamente só o bloqueio manual do superadmin restringe o acesso —
  // a expiração automática fica desligada enquanto a área de facturação
  // não estiver pronta (sem isto, uma conta "expired" ficaria bloqueada sem
  // nenhuma forma de pagar/renovar, já que /billing e /pricing também
  // estão bloqueados por agora).
  const isBlocked = status === 'blocked';
  const daysLeft = tenant ? tenantStore.daysUntilExpiry(tenant) : 0;

  return { tenant, status, isActive, isBlocked, daysLeft, refresh, syncFromServer };
}
