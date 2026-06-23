import { useEffect, useState, useCallback } from 'react';
import { tenantStore } from '@/lib/tenants';
import { Tenant } from '@/types/restaurant';

export function useLicense() {
  const [tenant, setTenant] = useState<Tenant | null>(() => tenantStore.current());

  const refresh = useCallback(() => setTenant(tenantStore.current()), []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    const onStorage = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const status = tenant?.subscription.status ?? null;
  const isActive = status === 'active' || status === 'trial';
  const isBlocked = status === 'blocked' || status === 'expired';
  const daysLeft = tenant ? tenantStore.daysUntilExpiry(tenant) : 0;

  return { tenant, status, isActive, isBlocked, daysLeft, refresh };
}
