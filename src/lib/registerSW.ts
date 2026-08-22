/**
 * Guarda de registro do service-worker.
 * - Só executa em produção (builds do vite).
 * - Ignora registro dentro de iframes (boa prática de segurança).
 */
function isRefusedContext(): boolean {
  // Nunca registrar em desenvolvimento
  if (!import.meta.env.PROD) return true;
  if (typeof window === 'undefined') return true;

  // Evitar registro dentro de iframes (boa prática comum do setor)
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  // (Opcional) Se quiser permitir que os usuários desabilitem manualmente via parâmetro de URL:
  // if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;

  return false;
}

// Auxiliar para cancelar o registro de qualquer SW existente que corresponda ao escopo "/sw.js"
async function unregisterAppSW() {
  if (!('serviceWorker' in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    regs
      .filter((r) =>
        (r.active?.scriptURL ?? r.installing?.scriptURL ?? '').includes('/sw.js')
      )
      .map((r) => r.unregister())
  );
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (isRefusedContext()) {
    // Cancela o registro de qualquer SW residual de implantações anteriores (não faz mal manter)
    void unregisterAppSW();
    return;
  }

  // Importa dinamicamente o módulo de registro do PWA e o ativa
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      // Mesmo em registerType "autoUpdate" (a versão nova activa-se
      // sozinha), o utilizador nunca sabia que isto tinha acontecido — num
      // contexto de rede fraca, um dispositivo podia ficar meses preso numa
      // versão antiga sem ninguém reparar. Aviso simples, sem bloquear nada.
      onNeedRefresh: () => {
        void import('sonner').then(({ toast }) => {
          toast.info('Nova versão disponível', {
            description: 'Actualize para ter as últimas melhorias.',
            action: { label: 'Actualizar', onClick: () => void updateSW(true) },
            duration: 15000,
          });
        });
      },
      onOfflineReady: () => {
        void import('sonner').then(({ toast }) => {
          toast.success('App pronta para funcionar offline');
        });
      },
    });
  });
}