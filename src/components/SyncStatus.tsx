import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, Trash2, RotateCw, ChevronDown } from 'lucide-react';
import { subscribeOutbox, flushOutbox, retryOutbox, clearOutbox, OUTBOX_WARN_AT, type OutboxState } from '@/lib/outbox';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const LABELS: Record<string, string> = {
  orders: 'Pedido', order_items: 'Itens do pedido', order_events: 'Eventos do pedido',
  restaurant_tables: 'Mesa', menu_items: 'Prato', inventory_items: 'Stock',
  customers: 'Cliente', staff: 'Funcionário', shifts: 'Turno',
  app_settings: 'Definições', loyalty_settings: 'Fidelidade', staff_permissions: 'Permissões',
  security_alerts: 'Alerta', subscriptions: 'Subscrição',
};

/** Fixed badge showing offline state, pending cloud writes and sync failures. */
export default function SyncStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [state, setState] = useState<OutboxState>({ pending: 0, failed: 0, ops: [] });
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const on = () => { setOnline(true); void flushOutbox(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = subscribeOutbox(setState);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);

  const { pending, failed, ops } = state;
  const nearLimit = ops.length >= OUTBOX_WARN_AT;

  // Resumo por tabela — mostrado antes de confirmar "Limpar fila", para o
  // utilizador perceber o que vai realmente perder, não só uma contagem.
  // Calculado antes do "return null" abaixo para não violar as regras dos
  // hooks se algum dia isto voltar a ser um useMemo.
  const byTable = Array.from(
    ops.reduce((counts, o) => counts.set(o.table, (counts.get(o.table) ?? 0) + 1), new Map<string, number>()).entries(),
  )
    .map(([table, count]) => ({ label: LABELS[table] ?? table, count }))
    .sort((a, b) => b.count - a.count);

  if (online && pending === 0 && failed === 0) return null;

  const tone = failed > 0 || nearLimit
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : 'border-warning/30 bg-warning/10 text-warning';

  const summary = nearLimit
    ? `Fila muito grande (${ops.length}) — verifique a ligação`
    : failed > 0
      ? `${failed} falha${failed === 1 ? '' : 's'} de sincronização`
      : online
        ? `A sincronizar ${pending} alteraç${pending === 1 ? 'ão' : 'ões'}…`
        : pending > 0
          ? `Offline — ${pending} por sincronizar`
          : 'Offline — dados locais';

  return (
    <div className="fixed top-2 right-2 z-[60] max-w-[92vw]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${tone}`}
      >
        {failed > 0
          ? <AlertTriangle className="h-3 w-3" />
          : online
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <CloudOff className="h-3 w-3" />}
        {summary}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 w-80 max-w-[92vw] rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{pending} pendente{pending === 1 ? '' : 's'}</span>
            <span>{failed} com falha</span>
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {ops.length === 0 && <p className="text-xs text-muted-foreground">Fila vazia.</p>}
            {ops.slice(0, 40).map(op => (
              <div key={op.id} className="rounded-lg border border-border/60 px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{LABELS[op.table] ?? op.table}</span>
                  <span className={op.failed ? 'text-destructive' : 'text-muted-foreground'}>
                    {op.failed ? 'falhou' : 'na fila'}
                  </span>
                </div>
                {op.error && <p className="mt-0.5 break-words text-[11px] text-destructive/80">{op.error}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {new Date(op.at).toLocaleTimeString('pt-PT')}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => void retryOutbox()}>
              <RotateCw className="mr-1 h-3.5 w-3.5" /> Tentar de novo
            </Button>
            <Button size="sm" variant="destructive" className="flex-1" onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Limpar fila
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar a fila de sincronização?</AlertDialogTitle>
            <AlertDialogDescription>
              As {pending + failed} alterações por enviar serão descartadas e nunca chegarão à nuvem:{' '}
              <strong>{byTable.map(t => `${t.count} ${t.label}${t.count === 1 ? '' : 's'}`).join(', ')}</strong>.
              Esta acção não pode ser anulada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { clearOutbox(); setConfirmClear(false); }}
            >
              Limpar fila
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
