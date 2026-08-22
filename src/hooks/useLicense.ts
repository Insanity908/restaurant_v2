import { useEffect, useState, useCallback } from 'react';
import { subscribeLicense } from '@/lib/store';
import { tenantStore, fetchTenant, refreshSubscription } from '@/lib/tenants';
import { planTier } from '@/lib/billing';
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
    // Realtime é a fonte primária agora — activar um plano no SuperAdmin
    // reflecte-se quase de imediato. O polling fica só como rede de
    // segurança (ligação perdida ao canal, mudanças que aconteçam antes da
    // subscrição estabelecer), por isso passou de 5 para 30 minutos.
    const id = setInterval(() => { void syncFromServer(); }, 30 * 60 * 1000);
    const onStorage = () => refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void syncFromServer(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);

    // switchTenant() sempre recarrega a página (ver AuthContext.tsx), por
    // isso o tenant_id corrente é estável durante a vida deste efeito.
    // useLicense() é chamado de vários sítios ao mesmo tempo na mesma
    // página (AppSidebar + RequireLicense + a própria página) — por isso
    // usa subscribeLicense (partilhado/com contagem de referências, ver
    // store.ts), nunca um `supabase.channel(...)` directo: um segundo canal
    // com o mesmo nome de tópico rebenta ("cannot add postgres_changes
    // callbacks ... after subscribe()"), porque o supabase-js devolve o
    // canal já existente em vez de criar um novo.
    const tenantId = tenantStore.current()?.id ?? localStorage.getItem('current_tenant_id');
    const unsubscribe = tenantId ? subscribeLicense(tenantId, () => void syncFromServer()) : undefined;

    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe?.();
    };
  }, [refresh, syncFromServer]);

  const status = tenant?.subscription.status ?? null;
  const isActive = status === 'active' || status === 'trial';
  // /billing e /pricing estão abertos (pagamento manual por WhatsApp), por
  // isso uma conta "expired" já tem para onde ir pagar/renovar — o
  // bloqueio automático por expiração volta a estar activo.
  const isBlocked = status === 'blocked' || status === 'expired';
  const daysLeft = tenant ? tenantStore.daysUntilExpiry(tenant) : 0;

  // Nível do plano — 'basic' só se aplica fora do período de teste, para
  // deixar experimentar tudo antes de escolher.
  const tier = status === 'trial' ? 'pro' : planTier(tenant?.subscription.plan);
  const isBasic = tier === 'basic';

  return { tenant, status, isActive, isBlocked, daysLeft, tier, isBasic, refresh, syncFromServer };
}
