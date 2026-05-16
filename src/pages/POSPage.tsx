import { useState } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { formatPrice } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { CreditCard, Banknote, Smartphone, Check, Printer, AlertTriangle, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { printReceipt, printServedItems } from '@/lib/receipt';
import { toast } from 'sonner';

export default function POSPage() {
  const { activeOrders, orders, completeOrder, cancelOrder, logPrint } = useRestaurant();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile-money'>('cash');
  const [showSuccess, setShowSuccess] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  const selectedOrder = activeOrders.find(o => o.id === selectedOrderId);
  const unservedItems = selectedOrder ? selectedOrder.items.filter(i => i.status !== 'served') : [];
  const allServed = !!selectedOrder && unservedItems.length === 0;

  const handlePayment = () => {
    if (!selectedOrderId) return;
    const result = completeOrder(selectedOrderId, paymentMethod, tip);
    if (!result.ok) {
      if (result.reason === 'unserved-items') {
        toast.error('Não é possível encerrar: há pratos por servir', {
          description: `${result.pending.length} item(s) ainda não foram servidos.`,
        });
      }
      return;
    }
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSelectedOrderId(null);
      setTip(0);
    }, 2000);
  };

  return (
    <PageShell title="Caixa / POS" subtitle="Processar pagamentos">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Orders */}
        <div className="space-y-3">
          <h2 className="font-heading font-bold text-foreground">Pedidos Activos</h2>
          {activeOrders.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center text-muted-foreground">
              <p>Nenhum pedido activo</p>
            </div>
          ) : (
            activeOrders.map(order => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={cn(
                  'w-full glass rounded-xl p-4 text-left transition-all hover:bg-card/100',
                  selectedOrderId === order.id && 'ring-2 ring-primary'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading font-bold text-foreground">
                    {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type === 'takeaway' ? 'Takeaway' : 'Entrega'}
                  </span>
                  <span className="text-xs text-muted-foreground">#{order.id.slice(-4)}</span>
                </div>
                <div className="space-y-1">
                  {order.items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                      <span className="text-foreground">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 pt-2 border-t border-border">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-primary">{formatPrice(order.total)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Payment Panel */}
        <div className="glass rounded-2xl p-6 space-y-6 h-fit sticky top-6">
          {selectedOrder ? (
            <>
              <h2 className="font-heading font-bold text-foreground">Pagamento</h2>

              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatPrice(selectedOrder.total)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Gorjeta</span>
                  <span className="text-foreground">{formatPrice(tip)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold text-lg">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatPrice(selectedOrder.total + tip)}</span>
                </div>
              </div>

              {/* Tip buttons */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Gorjeta</p>
                <div className="flex gap-2">
                  {[0, 50, 100, 200].map(t => (
                    <button
                      key={t}
                      onClick={() => setTip(t)}
                      className={cn(
                        'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                        tip === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                      )}
                    >
                      {t === 0 ? 'Sem' : formatPrice(t)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Método de Pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash' as const, icon: Banknote, label: 'Dinheiro' },
                    { key: 'card' as const, icon: CreditCard, label: 'Cartão' },
                    { key: 'mobile-money' as const, icon: Smartphone, label: 'M-Pesa' },
                  ].map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setPaymentMethod(key)}
                      className={cn(
                        'flex flex-col items-center gap-2 py-3 rounded-xl transition-all touch-target',
                        paymentMethod === key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {!allServed && (
                <div className="flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/30 p-3 text-xs text-warning">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Restam {unservedItems.length} item(s) por servir. O pedido só pode ser encerrado depois de todos os pratos serem servidos.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    printReceipt({ ...selectedOrder, tip, paymentMethod }, { title: 'Recibo / Conta' });
                    logPrint(selectedOrder.id, 'receipt', 'Recibo / Conta');
                  }}
                  className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2.5 rounded-xl font-bold text-sm hover:bg-secondary/80 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Recibo
                </button>
                <button
                  onClick={() => {
                    printServedItems(selectedOrder);
                    logPrint(selectedOrder.id, 'served-items', 'Itens servidos');
                  }}
                  disabled={!selectedOrder.items.some(i => i.status === 'served' || i.status === 'ready')}
                  className="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2.5 rounded-xl font-bold text-sm hover:bg-secondary/80 transition-colors disabled:opacity-40"
                >
                  <Printer className="w-4 h-4" /> Itens Servidos
                </button>
              </div>

              <button
                onClick={() => setHistoryOrderId(selectedOrder.id)}
                className="w-full flex items-center justify-center gap-2 bg-secondary/60 text-foreground py-2 rounded-xl font-medium text-xs hover:bg-secondary transition-colors"
              >
                <History className="w-4 h-4" /> Histórico de Reimpressão
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    cancelOrder(selectedOrderId!);
                    setSelectedOrderId(null);
                  }}
                  className="flex-1 bg-destructive/15 text-destructive py-3.5 rounded-xl font-bold text-sm hover:bg-destructive/25 transition-colors"
                >
                  Cancelar Pedido
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!allServed}
                  title={!allServed ? 'Todos os pratos devem ser servidos antes' : undefined}
                  className="flex-1 bg-success text-success-foreground py-3.5 rounded-xl font-bold text-sm hover:bg-success/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirmar Pagamento
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Selecione um pedido para processar</p>
            </div>
          )}
        </div>
      </div>

      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5 }} animate={{ scale: 1 }}
              className="bg-success/20 rounded-full p-8"
            >
              <Check className="w-16 h-16 text-success" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReprintHistoryDialog
        order={historyOrderId ? orders.find(o => o.id === historyOrderId) ?? null : null}
        onClose={() => setHistoryOrderId(null)}
        onReprintReceipt={(o) => { printReceipt(o, { title: 'Recibo / Conta' }); logPrint(o.id, 'receipt', 'Reimpressão de recibo'); }}
        onReprintServed={(o) => { printServedItems(o); logPrint(o.id, 'served-items', 'Reimpressão itens servidos'); }}
      />
    </PageShell>
  );
}

function ReprintHistoryDialog({
  order, onClose, onReprintReceipt, onReprintServed,
}: {
  order: import('@/types/restaurant').Order | null;
  onClose: () => void;
  onReprintReceipt: (o: import('@/types/restaurant').Order) => void;
  onReprintServed: (o: import('@/types/restaurant').Order) => void;
}) {
  const prints = (order?.events ?? [])
    .filter(e => e.type === 'receipt-printed' || e.type === 'served-items-printed')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const hasServed = !!order && order.items.some(i => i.status === 'served' || i.status === 'ready');

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="glass rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-foreground">Histórico de Reimpressão</h2>
                <p className="text-xs text-muted-foreground">Pedido #{order.id.slice(-4)}</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary/60">
                <Check className="w-5 h-5 opacity-0" />
                <span className="sr-only">Fechar</span>
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onReprintReceipt(order)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
                >
                  <Printer className="w-4 h-4" /> Reimprimir Recibo
                </button>
                <button
                  onClick={() => onReprintServed(order)}
                  disabled={!hasServed}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-bold text-sm hover:bg-secondary/80 transition-colors disabled:opacity-40"
                >
                  <Printer className="w-4 h-4" /> Reimprimir Servidos
                </button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-foreground mb-2">Impressões anteriores</h3>
                {prints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma impressão registada ainda.</p>
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {prints.map(ev => {
                      const isReceipt = ev.type === 'receipt-printed';
                      const date = new Date(ev.at).toLocaleString('pt', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      });
                      return (
                        <div key={ev.id} className="flex items-center gap-3 p-3 bg-secondary/20">
                          <span className={cn(
                            'text-xs font-bold px-2 py-1 rounded-md shrink-0',
                            isReceipt ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success',
                          )}>
                            {isReceipt ? 'Recibo' : 'Servidos'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{ev.note ?? (isReceipt ? 'Recibo impresso' : 'Itens servidos impressos')}</p>
                            <p className="text-xs text-muted-foreground">
                              {ev.actor ? `${ev.actor.name} · ${ev.actor.role}` : 'Sistema'} — {date}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
