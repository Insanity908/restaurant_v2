import { useState, useEffect, useMemo } from 'react';
import PageShell from '@/components/PageShell';
import KitchenOrderDetail from '@/components/KitchenOrderDetail';
import { useRestaurant } from '@/hooks/useRestaurant';
import { useAuth } from '@/context/AuthContext';
import { getMenuItemImage, formatPrice } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, X, HandPlatter } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const STATUS_CYCLE: Array<'pending' | 'preparing' | 'ready'> = ['pending', 'preparing', 'ready'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  preparing: 'Preparando',
  ready: 'Pronto ✓',
  served: 'Servido',
};

export default function KitchenPage() {
  const { orders, updateOrderItemStatus, updateOrder, cancelOrder, menuItems } = useRestaurant();
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [alertedReadyOrders, setAlertedReadyOrders] = useState<string[]>([]);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const isKitchen = user?.role === 'kitchen';
  const isWaiterOrCashier = user?.role === 'waiter' || user?.role === 'cashier';
  const canManageKitchen = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'kitchen';
  const canServe = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'waiter' || user?.role === 'cashier';
  const shouldReceiveReadyAlerts = isWaiterOrCashier;

  // Build the list of orders visible based on role.
  // - Kitchen: only orders with at least one pending/preparing item (hide ready ones).
  // - Waiter/Cashier: only orders with at least one ready item to serve.
  // - Admin/Manager: see everything that's not yet fully served/paid.
  const kitchenOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.paid || o.status === 'cancelled' || o.status === 'completed') return false;
      const hasPendingPrep = o.items.some(i => i.status === 'pending' || i.status === 'preparing');
      const hasReadyToServe = o.items.some(i => i.status === 'ready');
      if (isKitchen) return hasPendingPrep;
      if (isWaiterOrCashier) return hasReadyToServe;
      // admin/manager
      return hasPendingPrep || hasReadyToServe;
    });
  }, [orders, isKitchen, isWaiterOrCashier]);

  const detailOrder = kitchenOrders.find(o => o.id === detailOrderId) ?? null;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!shouldReceiveReadyAlerts) return;

    const readyOrders = kitchenOrders.filter(order =>
      order.items.length > 0 && order.items.every(item => item.status === 'ready' || item.status === 'served')
    );
    const newReadyOrders = readyOrders.filter(order => !alertedReadyOrders.includes(order.id));

    newReadyOrders.forEach(order => {
      toast.success('Prato completo', {
        description: `${order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type === 'takeaway' ? 'Takeaway' : 'Entrega'} está pronto para servir.`,
      });
    });

    if (newReadyOrders.length > 0) {
      setAlertedReadyOrders(prev => [...prev, ...newReadyOrders.map(order => order.id)]);
    }
  }, [alertedReadyOrders, kitchenOrders, shouldReceiveReadyAlerts]);

  const getElapsedMin = (createdAt: string) => Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000);
  const delayedCount = kitchenOrders.filter(o => getElapsedMin(o.createdAt) > 15).length;

  const cycleItemStatus = (orderId: string, itemId: string, currentStatus: string) => {
    const idx = STATUS_CYCLE.indexOf(currentStatus as any);
    if (idx < STATUS_CYCLE.length - 1) {
      updateOrderItemStatus(orderId, itemId, STATUS_CYCLE[idx + 1]);
    }
  };

  return (
    <PageShell
      title="Cozinha - Pedidos em Tempo Real"
      subtitle={`${now.toLocaleTimeString('pt', { hour: '2-digit', minute: '2-digit' })}`}
      actions={
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Pedidos ativos: <strong className="text-foreground">{kitchenOrders.length}</strong>
          </span>
          {delayedCount > 0 && (
            <span className="flex items-center gap-1.5 bg-destructive/15 text-destructive px-3 py-1.5 rounded-lg text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              Atrasados: {delayedCount}
            </span>
          )}
        </div>
      }
    >
      {kitchenOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <span className="text-5xl mb-4">👨‍🍳</span>
          <p className="text-lg font-medium">Nenhum pedido na fila</p>
          <p className="text-sm">Os pedidos aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {kitchenOrders.map(order => {
            const elapsed = getElapsedMin(order.createdAt);
            const isDelayed = elapsed > 15;
            const allReady = order.items.every(i => i.status === 'ready');
            // Items visíveis por papel
            const visibleItems = isKitchen
              ? order.items.filter(i => i.status === 'pending' || i.status === 'preparing')
              : isWaiterOrCashier
                ? order.items.filter(i => i.status === 'ready')
                : order.items;

            return (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn('glass rounded-2xl overflow-hidden', isDelayed && 'border-destructive/50')}
              >
                {/* Header — click to open detail */}
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <button
                    onClick={() => setDetailOrderId(order.id)}
                    className="flex-1 text-left hover:opacity-80 transition-opacity"
                    title="Ver detalhes do pedido"
                  >
                    <span className="text-xs text-muted-foreground font-medium">
                      {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type === 'takeaway' ? 'Takeaway' : 'Entrega'}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">#{order.id.slice(-4)}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full',
                      isDelayed ? 'bg-destructive text-destructive-foreground' : 'bg-success/15 text-success'
                    )}>
                      <Clock className="w-3 h-3" />
                      {elapsed} min
                    </span>
                    <button
                      onClick={() => cancelOrder(order.id)}
                      disabled={!canManageKitchen}
                      className="p-1 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-40"
                      title="Cancelar pedido"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Items — each clickable to cycle status */}
                <div className="p-3 space-y-2">
                  {visibleItems.map(item => {
                    const img = getMenuItemImage(item.name);
                    const isReady = item.status === 'ready';
                    const canServeItem = isReady && canServe;
                    const canCycle = canManageKitchen && !isReady;
                    const clickable = canCycle || canServeItem;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (canServeItem) {
                            updateOrderItemStatus(order.id, item.id, 'served');
                          } else if (canCycle) {
                            cycleItemStatus(order.id, item.id, item.status);
                          }
                        }}
                        disabled={!clickable}
                        className={cn(
                          'flex items-center gap-2 w-full text-left rounded-lg p-1.5 transition-colors',
                          clickable && 'hover:bg-secondary/50 cursor-pointer',
                          !clickable && 'cursor-default opacity-60',
                        )}
                        title={canServeItem ? 'Marcar como servido' : undefined}
                      >
                        {img ? (
                          <img src={img} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xs">🍽️</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">x{item.quantity}</p>
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
                      </button>
                    );
                  })}
                </div>

                {/* Quick actions */}
                {canManageKitchen && visibleItems.some(i => i.status !== 'ready') && (
                  <div className="flex gap-2 p-3 border-t border-border">
                    <button
                      onClick={() => {
                        const updatedItems = order.items.map(item =>
                          item.status === 'pending' ? { ...item, status: 'preparing' as const } : item
                        );
                        updateOrder(order.id, { items: updatedItems, status: 'preparing' });
                      }}
                      className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors touch-target"
                    >
                      Iniciar Todos
                    </button>
                    <button
                      onClick={() => {
                        const updatedItems = order.items.map(item =>
                          item.status === 'served' ? item : { ...item, status: 'ready' as const }
                        );
                        updateOrder(order.id, { items: updatedItems, status: 'ready' });
                      }}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-xs font-bold transition-colors touch-target',
                        allReady
                          ? 'bg-success/30 text-success cursor-default'
                          : 'bg-success text-success-foreground hover:bg-success/90'
                      )}
                    >
                      {allReady ? 'Tudo Pronto ✓' : 'Concluir Todos'}
                    </button>
                  </div>
                )}

                {/* Garçom: servir todos */}
                {isWaiterOrCashier && visibleItems.length > 0 && (
                  <div className="flex gap-2 p-3 border-t border-border">
                    <button
                      onClick={() => {
                        const updatedItems = order.items.map(item =>
                          item.status === 'ready' ? { ...item, status: 'served' as const } : item
                        );
                        updateOrder(order.id, { items: updatedItems });
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity touch-target"
                    >
                      <HandPlatter className="w-3.5 h-3.5" /> Servir Todos
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <KitchenOrderDetail
        order={detailOrder}
        menuItems={menuItems}
        onClose={() => setDetailOrderId(null)}
        canManage={canManageKitchen}
        canServe={canServe}
        viewerRole={user?.role}
        onStart={(itemId) => {
          if (!detailOrder) return;
          if (itemId) {
            updateOrderItemStatus(detailOrder.id, itemId, 'preparing');
          } else {
            detailOrder.items.forEach(item => {
              if (item.status === 'pending') updateOrderItemStatus(detailOrder.id, item.id, 'preparing');
            });
          }
          updateOrder(detailOrder.id, { status: 'preparing' });
        }}
        onComplete={(itemId) => {
          if (!detailOrder || !itemId) return;
          const updatedItems = detailOrder.items.map(item =>
            item.id === itemId ? { ...item, status: 'ready' as const } : item
          );
          const allReady = updatedItems.every(i => i.status === 'ready' || i.status === 'served');
          updateOrder(detailOrder.id, { items: updatedItems, status: allReady ? 'ready' : 'preparing' });
          // Se cozinheiro, fecha quando não há mais nada para preparar
          const stillToPrep = updatedItems.some(i => i.status === 'pending' || i.status === 'preparing');
          if (isKitchen && !stillToPrep) setDetailOrderId(null);
        }}
        onServe={(itemId) => {
          if (!detailOrder || !itemId) return;
          const updatedItems = detailOrder.items.map(item =>
            item.id === itemId ? { ...item, status: 'served' as const } : item
          );
          updateOrder(detailOrder.id, { items: updatedItems });
          // Se garçom e não há mais 'ready', fecha o modal
          const stillToServe = updatedItems.some(i => i.status === 'ready');
          if (isWaiterOrCashier && !stillToServe) setDetailOrderId(null);
        }}
      />
    </PageShell>
  );
}
