import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari não suporta display-mode: standalone via matchMedia — expõe
    // este campo próprio em vez disso quando a app já está instalada.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Deteta se a app pode ser instalada (PWA) e expõe uma função para disparar
 * o prompt nativo do browser. No Android/Chrome/Edge o browser emite
 * `beforeinstallprompt` e conseguimos mostrar um botão que o dispara; no
 * iOS Safari esse evento não existe — a app só pode ser instalada
 * manualmente via Partilhar → "Adicionar ao ecrã principal", por isso os
 * consumidores devem mostrar essas instruções quando `isIOS` for true.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  return {
    /** true quando o browser já ofereceu o evento nativo — podemos mostrar um botão que o dispara. */
    canPromptInstall: !!deferredPrompt,
    /** iOS Safari nunca emite beforeinstallprompt — mostra instruções manuais em vez de um botão. */
    isIOS: isIOS(),
    isInstalled: installed,
    promptInstall,
  };
}
