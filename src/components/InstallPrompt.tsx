import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useOptionalAuth } from '@/context/AuthContext';

/**
 * Notificação (toast) que aparece ao abrir a app convidando a instalar o
 * PWA — só quando o browser oferece o prompt nativo ou no iOS (que não
 * oferece, só instruções manuais), nunca se já estiver instalada. Aparece
 * em toda entrada na app (sem "snooze" persistente) — pedido explícito do
 * utilizador em 2026-08-27, veio a substituir o snooze de 7 dias anterior.
 */
export default function InstallPrompt() {
  const auth = useOptionalAuth();
  const hasUser = !!auth?.user;
  const { canPromptInstall, isIOS, isInstalled, promptInstall } = useInstallPrompt();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    if (!hasUser || isInstalled) return;
    if (!canPromptInstall && !isIOS) return;
    shown.current = true;

    toast('Instale a app no seu telemóvel', {
      id: 'pwa-install',
      description: isIOS
        ? 'Toca em Partilhar → "Adicionar ao ecrã principal" para acesso mais rápido, mesmo offline.'
        : 'Acesso mais rápido e funciona offline — instale a partir do ecrã principal.',
      icon: <Download className="w-4 h-4" />,
      duration: 15000,
      action: canPromptInstall
        ? { label: 'Instalar', onClick: () => { void promptInstall(); } }
        : undefined,
    });
  }, [hasUser, canPromptInstall, isIOS, isInstalled, promptInstall]);

  return null;
}
