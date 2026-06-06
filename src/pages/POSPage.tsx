import { useEffect, useMemo, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { formatPrice } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { CreditCard, Banknote, Smartphone, Check, Printer, AlertTriangle, History, UserPlus, Award, X, Search, Receipt as ReceiptIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { printReceipt, printServedItems } from '@/lib/receipt';
import { toast } from 'sonner';
import { customerStore } from '@/lib/store';
import { Customer, Order } from '@/types/restaurant';
import { maskMzPhone } from '@/lib/validators';

const POINTS_PER_MT = 1 / 10;
const MT_PER_POINT = 1; // 1 point = 1 MT discount

type POSTab = 'payments' | 'receipts';

export default function POSPage() {
  const { activeOrders, orders, completeOrder, cancelOrder, logPrint } = useRestaurant();
  const [tab, setTab] = useState<POSTab>('payments');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile-money'>('cash');
  const [showSuccess, setShowSuccess] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  // Loyalty linking
  const [phoneLookup, setPhoneLookup] = useState('');
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');

  const selectedOrder = activeOrders.find(o => o.id === selectedOrderId);
  const unservedItems = selectedOrder ? selectedOrder.items.filter(i => i.status !== 'served') : [];
  const allServed = !!selectedOrder && unservedItems.length === 0;

  // Auto-link if order already has a customer
  useEffect(() => {
    if (!selectedOrder) { setLinkedCustomer(null); setRedeemInput(''); setPhoneLookup(''); return; }
    if (selectedOrder.customerId) {
      const c = customerStore.getAll().find(x => x.id === selectedOrder.customerId);
      if (c) { setLinkedCustomer(c); return; }
    }
    if (selectedOrder.customerPhone) {
      const c = customerStore.findByPhone(selectedOrder.customerPhone);
      if (c) setLinkedCustomer(c);
      else setPhoneLookup(selectedOrder.customerPhone);
    }
  }, [selectedOrderId]);

  const customerStats = useMemo(() => {
    if (!linkedCustomer) return null;
    const norm = linkedCustomer.phone.replace(/\D/g, '');
    const matched = orders.filter(o => o.paid &&
      (o.customerId === linkedCustomer.id || (norm && o.customerPhone?.replace(/\D/g, '') === norm)));
    const totalSpent = matched.reduce((s, o) => s + (o.total ?? 0), 0);
    const earned = Math.floor(totalSpent * POINTS_PER_MT);
    const points = Math.max(0, earned + (linkedCustomer.pointsAdjustment || 0));
    return { points, totalSpent, orderCount: matched.length };
  }, [linkedCustomer, orders]);

  const subtotal = selectedOrder?.total ?? 0;
  const redeemPts = Math.max(0, Math.min(
    parseInt(redeemInput || '0', 10) || 0,
    customerStats?.points ?? 0,
    Math.floor(subtotal / MT_PER_POINT),
  ));
  const discount = redeemPts * MT_PER_POINT;
  const grandTotal = Math.max(0, subtotal - discount) + tip;
  const willEarn = linkedCustomer ? Math.floor(Math.max(0, subtotal - discount) * POINTS_PER_MT) : 0;

  const handleLookup = () => {
    const c = customerStore.findByPhone(phoneLookup);
    if (c) { setLinkedCustomer(c); toast.success(`Cliente ${c.name} ligado`); }
    else { toast.message('Cliente não encontrado', { description: 'Crie um novo registo abaixo.' }); setCreateOpen(true); }
  };

  const handlePayment = () => {
    if (!selectedOrderId) return;
    const result = completeOrder(selectedOrderId, paymentMethod, tip, {
      customerId: linkedCustomer?.id,
      discount,
      redeemedPoints: redeemPts,
    });
    if (!result.ok) {
      if (result.reason === 'unserved-items') {
        toast.error('Não é possível encerrar: há pratos por servir', {
          description: `${result.pending.length} item(s) ainda não foram servidos.`,
        });
      }
      return;
    }
    if (linkedCustomer) {
      const msgs: string[] = [];
      if (willEarn > 0) msgs.push(`+${willEarn} pontos`);
      if (redeemPts > 0) msgs.push(`-${redeemPts} resgatados`);
      if (msgs.length) toast.success(`Fidelidade: ${msgs.join(' · ')}`);
    }
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSelectedOrderId(null);
      setTip(0);
      setRedeemInput('');
      setLinkedCustomer(null);
      setPhoneLookup('');
    }, 2000);
  };

  return (
    <PageShell title="Caixa / POS" subtitle="Processar pagamentos e reimprimir recibos">
      <div className="mb-5 inline-flex rounded-xl bg-secondary/50 p-1">
        {([
          { key: 'payments', label: 'Pagamentos', icon: CreditCard },
          { key: 'receipts', label: 'Recibos', icon: ReceiptIcon },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'receipts' ? (
        <ReceiptsBrowser
          orders={orders}
          onReprintReceipt={(o) => { printReceipt(o, { title: 'Recibo / Conta' }); logPrint(o.id, 'receipt', 'Reimpressão de recibo'); }}
          onReprintServed={(o) => { printServedItems(o); logPrint(o.id, 'served-items', 'Reimpressão itens servidos'); }}
          onViewHistory={(id) => setHistoryOrderId(id)}
        />
      ) : (
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
                {discount > 0 && (
                  <div className="flex justify-between mb-2 text-success">
                    <span>Desconto fidelidade ({redeemPts} pts)</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Gorjeta</span>
                  <span className="text-foreground">{formatPrice(tip)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border font-bold text-lg">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatPrice(grandTotal)}</span>
                </div>
              </div>

              {/* Customer / Loyalty */}
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-primary" /> Cliente / Fidelidade
                  </span>
                  {linkedCustomer && (
                    <button onClick={() => { setLinkedCustomer(null); setRedeemInput(''); }}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Desligar
                    </button>
                  )}
                </div>
                {linkedCustomer ? (
                  <>
                    <div className="text-sm">
                      <div className="font-semibold">{linkedCustomer.name}</div>
                      <div className="text-xs text-muted-foreground">{linkedCustomer.phone}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-secondary/40 py-1.5">
                        <div className="text-sm font-semibold">{customerStats?.points ?? 0}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">Pontos</div>
                      </div>
                      <div className="rounded-md bg-secondary/40 py-1.5">
                        <div className="text-sm font-semibold">{customerStats?.orderCount ?? 0}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">Pedidos</div>
                      </div>
                      <div className="rounded-md bg-primary/15 py-1.5">
                        <div className="text-sm font-semibold text-primary">+{willEarn}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">A ganhar</div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text" inputMode="numeric" placeholder="Pontos a resgatar"
                        value={redeemInput}
                        onChange={e => setRedeemInput(e.target.value.replace(/\D/g, ''))}
                        className="flex-1 bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={() => setRedeemInput(String(Math.min(customerStats?.points ?? 0, Math.floor(subtotal / MT_PER_POINT))))}
                        className="text-xs px-2 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      >Máx</button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">1 ponto = {MT_PER_POINT} MT de desconto · ganha 1 ponto por cada 10 MT.</p>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="tel" placeholder="Telefone do cliente"
                      value={phoneLookup}
                      onChange={e => setPhoneLookup(maskMzPhone(e.target.value))}
                      className="flex-1 bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button onClick={handleLookup}
                      className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                      Ligar
                    </button>
                    <button onClick={() => setCreateOpen(true)} title="Novo cliente"
                      className="px-2 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                )}
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
      )}



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

      <QuickCustomerDialog
        open={createOpen}
        initialPhone={phoneLookup}
        onClose={() => setCreateOpen(false)}
        onCreated={(c) => { setLinkedCustomer(c); setCreateOpen(false); toast.success(`Cliente ${c.name} criado e ligado`); }}
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

function QuickCustomerDialog({
  open, initialPhone, onClose, onCreated,
}: {
  open: boolean;
  initialPhone: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(initialPhone);

  if (!open) return null;
  const valid = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9;

  const submit = () => {
    if (!valid) return;
    const existing = customerStore.findByPhone(phone);
    if (existing) { onCreated(existing); return; }
    const c = customerStore.add({ name: name.trim(), phone });
    onCreated(c);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-heading font-bold text-foreground">Novo cliente</h3>
        <div className="space-y-2">
          <input className="w-full bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="Nome" value={name} onChange={e => setName(e.target.value)} />
          <input className="w-full bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="Telefone (8X XXX XXXX)" value={phone}
            onChange={e => setPhone(maskMzPhone(e.target.value))} inputMode="numeric" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm">Cancelar</button>
          <button onClick={submit} disabled={!valid}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40">
            Criar e ligar
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptsBrowser({
  orders, onReprintReceipt, onReprintServed, onViewHistory,
}: {
  orders: Order[];
  onReprintReceipt: (o: Order) => void;
  onReprintServed: (o: Order) => void;
  onViewHistory: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const fromTs = new Date(`${from}T00:00:00`).getTime();
    const toTs = new Date(`${to}T23:59:59`).getTime();
    const q = query.trim().toLowerCase();
    return orders
      .filter(o => o.paid)
      .filter(o => {
        const t = new Date(o.closedAt ?? o.updatedAt ?? o.createdAt).getTime();
        return t >= fromTs && t <= toTs;
      })
      .filter(o => !q || o.id.toLowerCase().includes(q) || o.id.slice(-4).includes(q) ||
        (o.customerName ?? '').toLowerCase().includes(q) ||
        (o.tableNumber != null && String(o.tableNumber).includes(q)))
      .sort((a, b) => new Date(b.closedAt ?? b.updatedAt ?? b.createdAt).getTime() -
                       new Date(a.closedAt ?? a.updatedAt ?? a.createdAt).getTime());
  }, [orders, from, to, query]);

  const totalRevenue = filtered.reduce((s, o) => s + o.total + (o.tip || 0), 0);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Pesquisar (nº pedido, mesa, cliente)</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ex.: 1234"
              className="w-full bg-secondary/60 rounded-md pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="glass rounded-xl p-3">
          <div className="text-xs uppercase text-muted-foreground">Recibos</div>
          <div className="text-xl font-bold text-foreground">{filtered.length}</div>
        </div>
        <div className="glass rounded-xl p-3">
          <div className="text-xs uppercase text-muted-foreground">Receita</div>
          <div className="text-xl font-bold text-primary">{formatPrice(totalRevenue)}</div>
        </div>
        <div className="glass rounded-xl p-3 col-span-2 md:col-span-1">
          <div className="text-xs uppercase text-muted-foreground">Período</div>
          <div className="text-sm font-semibold text-foreground">{from} → {to}</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center text-muted-foreground">
          Nenhum recibo encontrado neste período.
        </div>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {filtered.map(o => {
            const when = new Date(o.closedAt ?? o.updatedAt ?? o.createdAt).toLocaleString('pt', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const label = o.type === 'dine-in' ? `Mesa ${o.tableNumber ?? '—'}` : o.type === 'takeaway' ? 'Takeaway' : 'Entrega';
            const hasServed = o.items.some(i => i.status === 'served' || i.status === 'ready');
            return (
              <div key={o.id} className="bg-card/40 p-3 flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold text-primary shrink-0">#{o.id.slice(-4)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">
                    {label}{o.customerName ? ` · ${o.customerName}` : ''}
                  </div>
                  <div className="text-xs text-muted-foreground">{when} · {o.items.length} item(s) · {formatPrice(o.total + (o.tip || 0))}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onReprintReceipt(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
                    <Printer className="w-3.5 h-3.5" /> Recibo
                  </button>
                  <button onClick={() => onReprintServed(o)} disabled={!hasServed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 disabled:opacity-40">
                    <Printer className="w-3.5 h-3.5" /> Servidos
                  </button>
                  <button onClick={() => onViewHistory(o.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary/60 text-foreground text-xs font-semibold hover:bg-secondary">
                    <History className="w-3.5 h-3.5" /> Histórico
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
