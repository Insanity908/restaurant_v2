// A.4 (spec-push-notificacoes-permissoes.md): opt-in de notificações push
// por dispositivo. Escreve directamente no Supabase (não passa pelo
// outbox/fila de sync) — só faz sentido registar um dispositivo que está
// online neste preciso momento.
import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPushPermissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// Converte a chave pública VAPID (base64url) para o formato Uint8Array que
// `pushManager.subscribe` exige em `applicationServerKey`.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

/** Existe já uma subscrição push activa neste dispositivo/navegador? */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

export async function subscribeToPush(params: {
  tenantId: string;
  staffId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: 'Notificações push não são suportadas neste navegador.' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: 'Chave VAPID pública não configurada.' };

  // Só pede permissão a partir de um clique explícito do utilizador — nunca
  // automático no arranque, para não estragar a taxa de aceitação nem
  // violar a política dos browsers.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: permission === 'denied' ? 'Permissão negada.' : 'Permissão não concedida.' };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const authKey = json.keys?.auth;
    if (!p256dh || !authKey) return { ok: false, error: 'Subscrição inválida (sem chaves).' };

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        tenant_id: params.tenantId,
        staff_id: params.staffId,
        endpoint: subscription.endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao subscrever notificações push.' };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: true };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true };
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao cancelar notificações push.' };
  }
}
