import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useOptionalAuth } from '@/context/AuthContext';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const SNOOZE_DAYS = 7;

function snoozed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}

function snooze() {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* quota */ }
}

/**
 * Notificação (toast) que aparece ao abrir a app convidando a instalar o
 * PWA — só quando o browser oferece o prompt nativo ou no iOS (que não
 * oferece, só instruções manuais), nunca se já estiver instalada, e no
 * máximo uma vez por SNOOZE_DAYS depois de dispensada, para não repetir em
 * cada abertura. Não renderiza nada — é só o efeito de disparar o toast.
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
    if (snoozed()) return;
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
      onDismiss: snooze,
      onAutoClose: snooze,
    });
  }, [hasUser, canPromptInstall, isIOS, isInstalled, promptInstall]);

  return null;
}
