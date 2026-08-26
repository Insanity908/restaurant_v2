import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff } from 'lucide-react';
import { useOptionalAuth } from '@/context/AuthContext';
import {
  getPushPermissionState, hasActiveSubscription, subscribeToPush, unsubscribeFromPush,
} from '@/lib/pushNotifications';
import { toast } from 'sonner';

interface PushNotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// iOS Safari só suporta Web Push dentro de uma PWA instalada na tela de
// início (iOS 16.4+) — nunca no Safari normal. Não há como contornar isto;
// só faz sentido avisar em vez de mostrar um toggle que silenciosamente não
// funciona.
function isIosNonStandalone(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

/**
 * Preferência pessoal do dispositivo (não do restaurante) — por isso vive
 * na AppSidebar, acessível a qualquer papel, e não em SettingsPage (que é
 * admin-only por desenho, ver ROUTE_PERMISSIONS em AuthContext.tsx).
 */
export default function PushNotificationsDialog({ open, onOpenChange }: PushNotificationsDialogProps) {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPermission(getPushPermissionState());
    void hasActiveSubscription().then(v => { setSubscribed(v); setLoaded(true); });
  }, [open]);

  if (!user) return null;

  const iosBlocked = isIosNonStandalone();

  const toggle = async (checked: boolean) => {
    const tenantId = user.tenantId ?? localStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    setBusy(true);
    if (checked) {
      const res = await subscribeToPush({ tenantId, staffId: user.id });
      if (!res.ok) {
        toast.error(res.error ?? 'Não foi possível ativar notificações');
        setPermission(getPushPermissionState());
        setBusy(false);
        return;
      }
      setSubscribed(true);
      toast.success('Notificações ativadas neste dispositivo');
    } else {
      const res = await unsubscribeFromPush();
      if (!res.ok) {
        toast.error(res.error ?? 'Não foi possível desativar notificações');
        setBusy(false);
        return;
      }
      setSubscribed(false);
      toast.success('Notificações desativadas neste dispositivo');
    }
    setPermission(getPushPermissionState());
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4" /> Notificações
          </DialogTitle>
        </DialogHeader>

        {permission === 'unsupported' ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <BellOff className="w-4 h-4 shrink-0" /> Este navegador não suporta notificações push.
          </p>
        ) : iosBlocked ? (
          <p className="text-sm text-muted-foreground">
            No iPhone/iPad, notificações só funcionam depois de instalar a app na tela de início
            (partilhar → "Adicionar à Tela de Início"). No Safari normal não é possível ativá-las.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="push-toggle" className="text-sm font-normal">
                Ativar notificações neste dispositivo
              </Label>
              <Switch
                id="push-toggle"
                checked={subscribed}
                disabled={busy || !loaded || permission === 'denied'}
                onCheckedChange={checked => void toggle(checked)}
              />
            </div>
            {permission === 'denied' && (
              <p className="text-xs text-muted-foreground">
                A permissão foi recusada anteriormente. Para ativar, tem de a reativar manualmente
                nas definições de notificações do navegador para este site.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Avisa quando um pedido novo chegar ou ficar pronto, mesmo com a app fechada.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
