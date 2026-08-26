import { useState, useEffect, useMemo } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { useAuth } from '@/context/AuthContext';
import { useLicense } from '@/hooks/useLicense';
import { BASIC_LIMITS } from '@/lib/billing';
import { cn } from '@/lib/utils';
import { Users, Plus, Pencil, Trash2, X, Clock, Eye, Printer, QrCode, Check, Ban, Bell, ArrowRightLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Table as TableType, Order, MenuItem } from '@/types/restaurant';
import { formatPrice, getMenuItemImage, findMenuItemImagePath } from '@/lib/helpers';
import StorageImage from '@/components/StorageImage';
import { MENU_BUCKET } from '@/lib/storage';
import { printReceipt, printServedItems } from '@/lib/receipt';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import QRCode from 'qrcode';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto',
  served: 'Servido',
};

export default function TablesPage() {
  const {
    tables, orders, menuItems, addTable, updateTable, deleteTable, logPrint,
    pendingConfirmationOrders, confirmPendingOrder, rejectPendingOrder, moveOrderToTable,
  } = useRestaurant();
  const { user, hasRole, hasPermission } = useAuth();
  const { isBasic } = useLicense();
  const navigate = useNavigate();
  const canManage = hasPermission('tables.manage');
  const canConfirm = hasRole(['admin', 'manager', 'cashier']);
  const tableLimitReached = isBasic && tables.length >= BASIC_LIMITS.maxTables;

  const handleNewTable = () => {
    if (tableLimitReached) {
      toast.error(`Limite de ${BASIC_LIMITS.maxTables} mesas do plano Básico atingido`, {
        description: 'Mude para o plano Profissional para ter mesas ilimitadas.',
      });
      return;
    }
    setCreating(true);
  };

  const handleQrClick = (table: TableType) => {
    if (isBasic) {
      toast.error('Pedido pelo cliente (QR) disponível no plano Profissional');
      return;
    }
    setQrTable(table);
  };

  const [editing, setEditing] = useState<TableType | null>(null);
  const [creating, setCreating] = useState(false);
  const [trackOrderId, setTrackOrderId] = useState<string | null>(null);
  const [qrTable, setQrTable] = useState<TableType | null>(null);
  const [tableToDelete, setTableToDelete] = useState<TableType | null>(null);
  const [movingOrder, setMovingOrder] = useState<Order | null>(null);

  const getTableOrder = (tableId: string) =>
    orders.find(o => o.tableId === tableId && !o.paid && o.status !== 'cancelled' && o.status !== 'awaiting-confirmation');
  const getPendingOrder = (tableId: string) =>
    pendingConfirmationOrders.find(o => o.tableId === tableId);

  const trackOrder = trackOrderId ? orders.find(o => o.id === trackOrderId) ?? null : null;

  return (
    <PageShell
      title="Secção de Mesas"
      subtitle="Gerir mesas e acompanhar pedidos"
      actions={
        canManage && (
          <button
            onClick={handleNewTable}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity touch-target"
          >
            <Plus className="w-4 h-4" /> Nova Mesa
          </button>
        )
      }
    >
      {canConfirm && (
        <PendingConfirmationPanel
          orders={pendingConfirmationOrders}
          onConfirm={confirmPendingOrder}
          onReject={rejectPendingOrder}
        />
      )}

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Legend color="success" label="Disponível" />
        <Legend color="destructive" label="Ocupada" />
        <Legend color="warning" label="Reservada" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {tables.map(table => {
          const order = getTableOrder(table.id);
          const pendingOrder = getPendingOrder(table.id);
          const occupied = table.status === 'occupied';
          const reserved = table.status === 'reserved';

          return (
            <div
              key={table.id}
              className={cn(
                'glass rounded-2xl p-5 flex flex-col items-center gap-3 transition-all relative',
                occupied && 'border-destructive/40 bg-destructive/5',
                reserved && 'border-warning/40 bg-warning/5',
                !occupied && !reserved && 'border-success/40 bg-success/5',
              )}
            >
              <div className="absolute top-2 left-2">
                <button
                  onClick={() => handleQrClick(table)}
                  className="p-1.5 rounded-md bg-secondary/70 hover:bg-secondary transition-colors"
                  title="Mostrar QR code para pedir"
                >
                  <QrCode className="w-3.5 h-3.5" />
                </button>
              </div>
              {canManage && (
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => setEditing(table)}
                    className="p-1.5 rounded-md bg-secondary/70 hover:bg-secondary transition-colors"
                    title="Editar mesa"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (occupied) {
                        toast.error('Não é possível remover uma mesa ocupada');
                        return;
                      }
                      if (pendingOrder) {
                        toast.error('Esta mesa tem um pedido do cliente por confirmar');
                        return;
                      }
                      setTableToDelete(table);
                    }}
                    className="p-1.5 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                    title="Remover mesa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center mt-2',
                occupied ? 'bg-destructive/20' : reserved ? 'bg-warning/20' : 'bg-secondary'
              )}>
                <Users className={cn(
                  'w-6 h-6',
                  occupied ? 'text-destructive' : reserved ? 'text-warning' : 'text-muted-foreground'
                )} />
              </div>
              <span className="font-heading font-bold text-foreground">Mesa {table.number}</span>
              <span className="text-xs text-muted-foreground">{table.seats} lugares</span>
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  occupied ? 'bg-destructive' : reserved ? 'bg-warning' : 'bg-success'
                )} />
                <span className={cn(
                  'text-xs font-medium',
                  occupied ? 'text-destructive' : reserved ? 'text-warning' : 'text-success'
                )}>
                  {occupied ? 'Ocupada' : reserved ? 'Reservada' : 'Disponível'}
                </span>
              </div>

              {order && (
                <div className="w-full flex flex-col gap-1.5 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground text-center">
                    {order.items.length} item(s)
                  </span>
                  <ElapsedBadge createdAt={order.createdAt} />
                </div>
              )}

              {pendingOrder && (
                <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md bg-warning/15 text-warning">
                  <Bell className="w-3 h-3" /> Pedido do cliente por confirmar
                </span>
              )}

              <div className="w-full flex flex-col gap-2 pt-2">
                {order ? (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTrackOrderId(order.id)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-bold hover:bg-secondary/80 transition-colors touch-target"
                      >
                        <Eye className="w-3.5 h-3.5" /> Acompanhar
                      </button>
                      <button
                        onClick={() => navigate('/pos')}
                        className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity touch-target"
                      >
                        Conta
                      </button>
                    </div>
                    <button
                      onClick={() => navigate('/menu', { state: { addToOrderId: order.id, tableId: table.id, tableNumber: table.number } })}
                      className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-success/20 text-success text-xs font-bold hover:bg-success/30 transition-colors touch-target"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar pedido
                    </button>
                    {tables.some(t => t.status === 'free') && (
                      <button
                        onClick={() => setMovingOrder(order)}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-bold hover:bg-secondary/80 transition-colors touch-target"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Mover mesa
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => navigate('/menu', { state: { tableId: table.id, tableNumber: table.number } })}
                    className="flex-1 py-2 rounded-lg bg-success text-success-foreground text-xs font-bold hover:opacity-90 transition-opacity touch-target"
                  >
                    Abrir pedido
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TableFormDialog
        open={creating || !!editing}
        table={editing}
        existingNumbers={tables.map(t => t.number)}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSubmit={(data) => {
          if (editing) {
            updateTable(editing.id, data);
            toast.success(`Mesa ${data.number} atualizada`);
          } else {
            addTable({ ...data, status: 'free' });
            toast.success(`Mesa ${data.number} criada`);
          }
          setCreating(false);
          setEditing(null);
        }}
      />

      <OrderTrackerDialog order={trackOrder} menuItems={menuItems} onClose={() => setTrackOrderId(null)} onLogPrint={logPrint} />

      <MoveOrderDialog
        order={movingOrder}
        freeTables={tables.filter(t => t.status === 'free')}
        onClose={() => setMovingOrder(null)}
        onMove={(tableId) => {
          if (!movingOrder) return;
          const res = moveOrderToTable(movingOrder.id, tableId);
          if (res.ok) toast.success('Pedido movido de mesa');
          else toast.error(res.error);
          setMovingOrder(null);
        }}
      />

      <TableQrDialog table={qrTable} tenantId={user?.tenantId} onClose={() => setQrTable(null)} />

      <AlertDialog open={!!tableToDelete} onOpenChange={(open) => { if (!open) setTableToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Mesa {tableToDelete?.number}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (tableToDelete) deleteTable(tableToDelete.id); setTableToDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function PendingConfirmationPanel({
  orders, onConfirm, onReject,
}: {
  orders: Order[];
  onConfirm: (orderId: string) => void;
  onReject: (orderId: string) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <div className="glass rounded-2xl border border-warning/30 bg-warning/5 p-4 mb-6 space-y-3">
      <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-warning">
        <Bell className="w-4 h-4" /> Pedidos do cliente por confirmar ({orders.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {orders.map(order => (
          <div key={order.id} className="rounded-xl bg-background/60 border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">
                {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : `Entrega — ${order.customerName ?? order.customerPhone}`}
              </span>
              <span className="text-xs text-muted-foreground">{formatPrice(order.total)}</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {order.items.map(item => (
                <li key={item.id}>{item.quantity}x {item.name}{item.notes ? ` — ${item.notes}` : ''}</li>
              ))}
            </ul>
            {order.deliveryAddress && (
              <p className="text-xs text-muted-foreground">
                Morada: {order.deliveryAddress.split('\n').map((line, idx) => (
                  <span key={idx}>
                    {idx > 0 && ' '}
                    {/^https?:\/\//.test(line.trim()) ? (
                      <a href={line.trim()} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                        Ver no Google Maps
                      </a>
                    ) : line}
                  </span>
                ))}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onReject(order.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-bold hover:bg-destructive/25 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" /> Rejeitar
              </button>
              <button
                onClick={() => onConfirm(order.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-success text-success-foreground text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <Check className="w-3.5 h-3.5" /> Confirmar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableQrDialog({ table, tenantId, onClose }: { table: TableType | null; tenantId?: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = table && tenantId
    ? `${window.location.origin}/pedir/${tenantId}/mesa/${table.id}?n=${table.number}`
    : null;

  useEffect(() => {
    if (!url) { setDataUrl(null); return; }
    let active = true;
    QRCode.toDataURL(url, { width: 260, margin: 1 }).then(d => { if (active) setDataUrl(d); });
    return () => { active = false; };
  }, [url]);

  if (!table) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="glass rounded-2xl w-full max-w-xs p-6 space-y-4 text-center"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Mesa {table.number}</h2>
            <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-md hover:bg-secondary/60">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            O cliente digitaliza este código para ver o cardápio e pedir directo desta mesa.
          </p>
          {dataUrl ? (
            <img src={dataUrl} alt={`QR code da Mesa ${table.number}`} className="mx-auto rounded-lg" />
          ) : (
            <div className="w-[260px] h-[260px] mx-auto rounded-lg bg-secondary animate-pulse" />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MoveOrderDialog({
  order, freeTables, onClose, onMove,
}: {
  order: Order | null;
  freeTables: TableType[];
  onClose: () => void;
  onMove: (tableId: string) => void;
}) {
  if (!order) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="glass rounded-2xl w-full max-w-sm p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Mover Mesa {order.tableNumber}</h2>
            <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-md hover:bg-secondary/60">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Escolha a mesa de destino — o pedido (itens, histórico) mantém-se, só muda de mesa.</p>
          {freeTables.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem mesas livres.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {freeTables.map(t => (
                <button
                  key={t.id}
                  onClick={() => onMove(t.id)}
                  className="py-3 rounded-lg bg-success/15 text-success font-bold hover:bg-success/25 transition-colors"
                >
                  Mesa {t.number}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Legend({ color, label }: { color: 'success' | 'destructive' | 'warning'; label: string }) {
  const cls = color === 'success' ? 'bg-success' : color === 'destructive' ? 'bg-destructive' : 'bg-warning';
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-3 h-3 rounded-full', cls)} />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function ElapsedBadge({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor((now - new Date(createdAt).getTime()) / 1000);
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  const delayed = min > 15;
  return (
    <span className={cn(
      'flex items-center justify-center gap-1 text-xs font-bold px-2 py-1 rounded-md',
      delayed ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
    )}>
      <Clock className="w-3 h-3" />
      {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

interface TableFormDialogProps {
  open: boolean;
  table: TableType | null;
  existingNumbers: number[];
  onClose: () => void;
  onSubmit: (data: { number: number; seats: number; status: TableType['status'] }) => void;
}

function TableFormDialog({ open, table, existingNumbers, onClose, onSubmit }: TableFormDialogProps) {
  const [number, setNumber] = useState(1);
  const [seats, setSeats] = useState(4);
  const [status, setStatus] = useState<TableType['status']>('free');

  useEffect(() => {
    if (table) {
      setNumber(table.number);
      setSeats(table.seats);
      setStatus(table.status);
    } else if (open) {
      const next = (existingNumbers.length ? Math.max(...existingNumbers) : 0) + 1;
      setNumber(next);
      setSeats(4);
      setStatus('free');
    }
    // existingNumbers is deliberately excluded: it's a fresh array every
    // parent render (tables.map(...)), and the parent re-renders every
    // second via its own clock tick — including it here would reset
    // whatever the user is mid-typing roughly once per second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, open]);

  if (!open) return null;

  const numberConflict = existingNumbers.some(n => n === number && n !== table?.number);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="glass rounded-2xl w-full max-w-md p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">
              {table ? `Editar Mesa ${table.number}` : 'Nova Mesa'}
            </h2>
            <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-md hover:bg-secondary/60">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Número da mesa" htmlFor="table-number">
              <input
                id="table-number"
                type="number"
                min={1}
                value={number === 0 ? '' : number}
                onChange={e => setNumber(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-foreground border border-border focus:outline-none focus:border-primary"
              />
              {numberConflict && <p className="text-xs text-destructive mt-1">Já existe uma mesa com este número.</p>}
            </Field>
            <Field label="Lugares" htmlFor="table-seats">
              <input
                id="table-seats"
                type="number"
                min={1}
                value={seats === 0 ? '' : seats}
                onChange={e => setSeats(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-foreground border border-border focus:outline-none focus:border-primary"
              />
            </Field>
            <Field label="Estado" htmlFor="table-status">
              <select
                id="table-status"
                value={status}
                onChange={e => setStatus(e.target.value as TableType['status'])}
                className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-foreground border border-border focus:outline-none focus:border-primary"
              >
                <option value="free">Disponível</option>
                <option value="reserved">Reservada</option>
                <option value="occupied">Ocupada</option>
              </select>
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              disabled={number < 1 || seats < 1 || numberConflict}
              onClick={() => onSubmit({ number, seats, status })}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function OrderTrackerDialog({ order, menuItems, onClose, onLogPrint }: { order: Order | null; menuItems: MenuItem[]; onClose: () => void; onLogPrint?: (orderId: string, kind: 'receipt' | 'served-items', note?: string) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const elapsedSec = order ? Math.floor((now - new Date(order.createdAt).getTime()) / 1000) : 0;
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  const delayed = min > 15;

  const events = useMemo(() => {
    if (!order?.events) return [];
    return [...order.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [order?.events]);

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="glass rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type === 'takeaway' ? 'Takeaway' : 'Entrega'}
                </h2>
                <p className="text-xs text-muted-foreground">Pedido #{order.id.slice(-4)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums',
                  delayed ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
                )}>
                  <Clock className="w-4 h-4" />
                  {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
                </span>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary/60">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 space-y-6">
              <section>
                <h3 className="text-sm font-bold text-foreground mb-3">Itens do pedido</h3>
                <div className="space-y-2">
                  {order.items.map(item => {
                    const imgPath = findMenuItemImagePath(item.menuItemId, menuItems);
                    return (
                      <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
                        <StorageImage
                          bucket={MENU_BUCKET}
                          path={imgPath}
                          fallbackSrc={getMenuItemImage(item.name)}
                          alt={item.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                          placeholder={<div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-xl shrink-0">🍽️</div>}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">x{item.quantity} · {formatPrice(item.price * item.quantity)}</p>
                        </div>
                        <span className={cn(
                          'text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap',
                          item.status === 'pending' && 'bg-warning/15 text-warning',
                          item.status === 'preparing' && 'bg-primary/15 text-primary',
                          item.status === 'ready' && 'bg-success/15 text-success',
                          item.status === 'served' && 'bg-muted text-muted-foreground',
                        )}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-foreground mb-3">Histórico de eventos</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos registados ainda.</p>
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {events.map(ev => {
                      const date = new Date(ev.at);
                      const label = ev.type === 'item-ready' ? 'Pronto'
                        : ev.type === 'item-served' ? 'Servido'
                        : ev.type === 'item-preparing' ? 'Em preparação'
                        : 'Pendente';
                      const cls = ev.type === 'item-ready' ? 'bg-success/15 text-success'
                        : ev.type === 'item-served' ? 'bg-primary/15 text-primary'
                        : 'bg-warning/15 text-warning';
                      return (
                        <div key={ev.id} className="flex items-center gap-3 p-3 bg-secondary/20">
                          <span className={cn('text-xs font-bold px-2 py-1 rounded-md shrink-0', cls)}>{label}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{ev.itemName ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">
                              {ev.actor ? `${ev.actor.name} · ${ev.actor.role}` : 'Sistema'} —{' '}
                              {date.toLocaleString('pt', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="flex items-center justify-between p-4 rounded-xl bg-secondary/40">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="text-xl font-bold text-foreground">{formatPrice(order.total)}</span>
              </section>

              <section className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => { printReceipt(order, { title: 'Recibo do Pedido' }); onLogPrint?.(order.id, 'receipt', 'Recibo do Pedido'); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
                >
                  <Printer className="w-4 h-4" /> Imprimir Pedido
                </button>
                <button
                  onClick={() => { printServedItems(order); onLogPrint?.(order.id, 'served-items', 'Itens servidos'); }}
                  disabled={!order.items.some(i => i.status === 'served' || i.status === 'ready')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-sm hover:bg-secondary/80 transition-colors disabled:opacity-40"
                >
                  <Printer className="w-4 h-4" /> Itens Servidos
                </button>
              </section>

              {(() => {
                const prints = (order.events ?? [])
                  .filter(e => e.type === 'receipt-printed' || e.type === 'served-items-printed')
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
                return (
                  <section>
                    <h3 className="text-sm font-bold text-foreground mb-2">Histórico de reimpressão ({prints.length})</h3>
                    {prints.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma impressão registada.</p>
                    ) : (
                      <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                        {prints.map(ev => {
                          const isReceipt = ev.type === 'receipt-printed';
                          const date = new Date(ev.at).toLocaleString('pt', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          return (
                            <div key={ev.id} className="flex items-center gap-3 p-3 bg-secondary/20">
                              <span className={cn('text-xs font-bold px-2 py-1 rounded-md shrink-0', isReceipt ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success')}>
                                {isReceipt ? 'Recibo' : 'Servidos'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">
                                  {ev.actor ? `${ev.actor.name} · ${ev.actor.role}` : 'Sistema'} — {date}
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  if (isReceipt) { printReceipt(order, { title: 'Recibo do Pedido' }); onLogPrint?.(order.id, 'receipt', 'Reimpressão'); }
                                  else { printServedItems(order); onLogPrint?.(order.id, 'served-items', 'Reimpressão'); }
                                }}
                                className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80"
                              >
                                Reimprimir
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
