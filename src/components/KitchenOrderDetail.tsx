import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Play, Check, ChevronLeft, ChevronRight, HandPlatter, Printer } from 'lucide-react';
import { Order, MenuItem, UserRole } from '@/types/restaurant';
import { getMenuItemImage } from '@/lib/helpers';
import { printReceipt, printServedItems } from '@/lib/receipt';
import { cn } from '@/lib/utils';

interface PrepStep {
  label: string;
  icon: string;
  done?: boolean;
}

interface Ingredient {
  name: string;
  qty: string;
  icon: string;
}

// Mock recipes — keyed by item name
const RECIPES: Record<string, { ingredients: Ingredient[]; steps: PrepStep[]; temp?: string }> = {
  'Pizza Pepperoni': {
    ingredients: [
      { name: 'Mozzarella', qty: '200g', icon: '🧀' },
      { name: 'Pepperoni', qty: '100g', icon: '🍖' },
      { name: 'Molho de tomate', qty: '160g', icon: '🥫' },
      { name: 'Orégano', qty: '2 colheres', icon: '🌿' },
    ],
    steps: [
      { label: 'Espalhar molho de tomate', icon: '🥫', done: true },
      { label: 'Adicionar mozzarella', icon: '🧀', done: true },
      { label: 'Colocar pepperoni', icon: '🍖', done: true },
      { label: 'Levar ao forno a 220°C por 10 minutos', icon: '🔥' },
    ],
    temp: '220°C / 10m',
  },
  'Hambúrguer Gourmet': {
    ingredients: [
      { name: 'Pão brioche', qty: '1 un', icon: '🍞' },
      { name: 'Carne bovina', qty: '180g', icon: '🥩' },
      { name: 'Queijo cheddar', qty: '40g', icon: '🧀' },
      { name: 'Alface e tomate', qty: 'q.b.', icon: '🥬' },
    ],
    steps: [
      { label: 'Temperar e moldar a carne', icon: '🥩', done: true },
      { label: 'Grelhar 4 min cada lado', icon: '🔥' },
      { label: 'Adicionar queijo e derreter', icon: '🧀' },
      { label: 'Montar no pão tostado', icon: '🍞' },
    ],
    temp: '4+4 min',
  },
  'Sushi Roll Misto': {
    ingredients: [
      { name: 'Arroz para sushi', qty: '150g', icon: '🍚' },
      { name: 'Salmão fresco', qty: '80g', icon: '🐟' },
      { name: 'Alga nori', qty: '1 folha', icon: '🟢' },
      { name: 'Pepino', qty: '30g', icon: '🥒' },
    ],
    steps: [
      { label: 'Estender arroz sobre nori', icon: '🍚', done: true },
      { label: 'Adicionar recheios', icon: '🐟' },
      { label: 'Enrolar com a esteira', icon: '🍣' },
      { label: 'Cortar em 8 peças', icon: '🔪' },
    ],
  },
  'Frango Grelhado': {
    ingredients: [
      { name: 'Peito de frango', qty: '220g', icon: '🍗' },
      { name: 'Azeite e ervas', qty: 'q.b.', icon: '🌿' },
      { name: 'Limão', qty: '½', icon: '🍋' },
    ],
    steps: [
      { label: 'Temperar com ervas e limão', icon: '🌿', done: true },
      { label: 'Grelhar 6 min cada lado', icon: '🔥' },
      { label: 'Repousar 2 min antes de servir', icon: '⏱️' },
    ],
    temp: '6+6 min',
  },
};

const DEFAULT_RECIPE: { ingredients: Ingredient[]; steps: PrepStep[]; temp?: string } = {
  ingredients: [{ name: 'Ingredientes do prato', qty: 'conforme ficha', icon: '🍽️' }],
  steps: [
    { label: 'Preparar ingredientes', icon: '🔪', done: true },
    { label: 'Cozinhar conforme padrão', icon: '🔥' },
    { label: 'Empratar e servir', icon: '🍽️' },
  ],
};

interface Props {
  order: Order | null;
  menuItems?: MenuItem[];
  onClose: () => void;
  canManage: boolean;
  canServe?: boolean;
  viewerRole?: UserRole;
  onStart?: (itemId?: string) => void;
  onComplete?: (itemId?: string) => void;
  onServe?: (itemId?: string) => void;
}

function resolveRecipe(itemName: string, menuItemId: string, menuItems?: MenuItem[]): { ingredients: Ingredient[]; steps: PrepStep[]; temp?: string } {
  const mi = menuItems?.find(m => m.id === menuItemId);
  if (mi?.recipe && (mi.recipe.ingredients.length || mi.recipe.steps.length)) {
    return {
      ingredients: mi.recipe.ingredients.map(i => ({ name: i.name, qty: i.qty, icon: i.icon || '🍽️' })),
      steps: mi.recipe.steps.map(s => ({ label: s.label, icon: s.icon || '👨‍🍳' })),
      temp: mi.recipe.temp,
    };
  }
  return RECIPES[itemName] || DEFAULT_RECIPE;
}

export default function KitchenOrderDetail({ order, menuItems, onClose, canManage, canServe, viewerRole, onStart, onComplete, onServe }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Reset active index when the order changes
  useEffect(() => {
    setActiveIdx(0);
  }, [order?.id]);

  const isKitchenViewer = viewerRole === 'kitchen';
  const isWaiterViewer = viewerRole === 'waiter' || viewerRole === 'cashier';

  // Filter items shown based on role
  const allItems = order?.items ?? [];
  const items = isKitchenViewer
    ? allItems.filter(i => i.status === 'pending' || i.status === 'preparing')
    : isWaiterViewer
      ? allItems.filter(i => i.status === 'ready')
      : allItems;

  const safeIdx = Math.min(activeIdx, Math.max(items.length - 1, 0));
  const activeItem = items[safeIdx];
  // O botão "Iniciar Preparação" agora é por prato: só aparece se o item ativo ainda está pendente
  const activeItemPending = activeItem?.status === 'pending';
  const activeItemReady = activeItem?.status === 'ready';

  const goPrev = () => setActiveIdx(i => (i - 1 + items.length) % items.length);
  const goNext = () => setActiveIdx(i => (i + 1) % items.length);

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
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="glass rounded-3xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">KDS</span>
                <span className="text-sm text-foreground/80">
                  {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type === 'takeaway' ? 'Takeaway' : 'Entrega'}
                </span>
                <span className="text-xs text-muted-foreground">#{order.id.slice(-4)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printReceipt(order, { title: 'Pedido — Cozinha' })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors"
                  title="Imprimir pedido"
                >
                  <Printer className="w-3.5 h-3.5" /> Pedido
                </button>
                {order.items.some(i => i.status === 'served' || i.status === 'ready') && (
                  <button
                    onClick={() => printServedItems(order)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/60 hover:bg-secondary text-xs font-medium transition-colors"
                    title="Imprimir itens servidos"
                  >
                    <Printer className="w-3.5 h-3.5" /> Servidos
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Item tabs — only when more than one item */}
            {items.length > 1 && (
              <div className="flex items-center gap-2 px-6 py-3 border-b border-border overflow-x-auto">
                <button
                  onClick={goPrev}
                  className="p-1.5 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors shrink-0"
                  title="Prato anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 flex-1 overflow-x-auto">
                  {items.map((it, idx) => (
                    <button
                      key={it.id}
                      onClick={() => setActiveIdx(idx)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                        idx === safeIdx
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 text-foreground hover:bg-secondary'
                      )}
                    >
                      <span className="opacity-70">{idx + 1}.</span>
                      <span>{it.name}</span>
                      <span className="opacity-70">x{it.quantity}</span>
                      {it.status === 'ready' && <Check className="w-3 h-3 text-success" />}
                    </button>
                  ))}
                </div>
                <button
                  onClick={goNext}
                  className="p-1.5 rounded-lg bg-secondary/60 hover:bg-secondary transition-colors shrink-0"
                  title="Próximo prato"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
              {/* LEFT — main item */}
              <OrderItemPanel order={order} activeItem={activeItem} />

              {/* CENTER — ingredients */}
              <IngredientsPanel activeItem={activeItem} menuItems={menuItems} />

              {/* RIGHT — preparation */}
              <PreparationPanel activeItem={activeItem} menuItems={menuItems} />

              {/* FULL WIDTH — events log */}
              <div className="lg:col-span-3">
                <EventsLogPanel order={order} />
              </div>
            </div>

            {/* Bottom actions */}
            {(canManage || canServe) && activeItem && (
              <div className="flex flex-col sm:flex-row gap-3 px-6 py-4 border-t border-border">
                {canManage && activeItemPending && (
                  <button
                    onClick={() => onStart?.(activeItem?.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-warning text-warning-foreground font-bold hover:opacity-90 transition-opacity touch-target"
                  >
                    <Play className="w-4 h-4" /> Iniciar Preparação{items.length > 1 ? ` — ${activeItem?.name}` : ''}
                  </button>
                )}
                {canManage && activeItem.status === 'preparing' && (
                  <button
                    onClick={() => onComplete?.(activeItem.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-success text-success-foreground font-bold hover:opacity-90 transition-opacity touch-target"
                  >
                    <Check className="w-4 h-4" /> Concluir Prato{items.length > 1 ? ` — ${activeItem.name}` : ''}
                  </button>
                )}
                {canServe && activeItemReady && (
                  <button
                    onClick={() => onServe?.(activeItem.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity touch-target"
                  >
                    <HandPlatter className="w-4 h-4" /> Marcar como Servido{items.length > 1 ? ` — ${activeItem.name}` : ''}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function OrderItemPanel({ order, activeItem }: { order: Order; activeItem?: Order['items'][number] }) {
  const main = activeItem ?? order.items[0];
  const img = main ? getMenuItemImage(main.name) : undefined;
  const readyCount = order.items.filter(i => i.status === 'ready' || i.status === 'served').length;
  const progress = order.items.length ? Math.round((readyCount / order.items.length) * 100) : 0;
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const itemStatus = main?.status;
  const statusLabel = itemStatus === 'ready' || itemStatus === 'served' ? 'Pronto' : itemStatus === 'preparing' ? 'Preparando' : 'Aguardando';

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Prato em foco</p>
      <div className="rounded-2xl overflow-hidden bg-secondary aspect-[4/3]">
        {img ? (
          <img src={img} alt={main?.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">🍽️</div>
        )}
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">{main?.name ?? 'Pedido'}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : '—'} · Qtd: x{main?.quantity ?? 1}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Pedido completo</span>
          <span className="text-muted-foreground">{elapsed} min decorridos</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-warning transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">0%</span>
          <span className="font-bold text-warning">{progress}% Concluído</span>
          <span className="text-muted-foreground">100%</span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground">Status do prato:</span>
        <span className={cn(
          'text-xs font-bold px-2 py-1 rounded-md',
          statusLabel === 'Pronto' && 'bg-success/15 text-success',
          statusLabel === 'Preparando' && 'bg-warning/15 text-warning',
          statusLabel === 'Aguardando' && 'bg-muted text-muted-foreground',
        )}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function IngredientsPanel({ activeItem, menuItems }: { activeItem?: Order['items'][number]; menuItems?: MenuItem[] }) {
  const recipe = activeItem ? resolveRecipe(activeItem.name, activeItem.menuItemId, menuItems) : DEFAULT_RECIPE;
  const qty = activeItem?.quantity ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-foreground">Ingredientes</h3>
        <span className="text-xs text-muted-foreground">(x{qty})</span>
      </div>
      <div className="space-y-2">
        {recipe.ingredients.map((ing, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-transparent"
          >
            <span className="text-2xl">{ing.icon}</span>
            <span className="text-sm font-medium text-foreground">
              {ing.name}: <span className="text-muted-foreground">{ing.qty}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreparationPanel({ activeItem, menuItems }: { activeItem?: Order['items'][number]; menuItems?: MenuItem[] }) {
  const recipe = activeItem ? resolveRecipe(activeItem.name, activeItem.menuItemId, menuItems) : DEFAULT_RECIPE;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-foreground">Modo de Preparo</h3>
      <div className="space-y-2">
        {recipe.steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
            <div className={cn(
              'w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
              step.done ? 'bg-success border-success' : 'border-muted-foreground/40'
            )}>
              {step.done && <Check className="w-3.5 h-3.5 text-success-foreground" />}
            </div>
            <span className="text-2xl">{step.icon}</span>
            <span className={cn(
              'text-sm flex-1',
              step.done ? 'text-muted-foreground line-through' : 'text-foreground'
            )}>
              {idx + 1}. {step.label}
            </span>
          </div>
        ))}
      </div>
      {recipe.temp && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-sm">
          <Clock className="w-4 h-4 text-warning" />
          <span className="font-medium text-foreground">{recipe.temp}</span>
        </div>
      )}
    </div>
  );
}

const EVENT_LABELS: Record<string, { label: string; cls: string; icon: string }> = {
  'item-preparing': { label: 'Iniciou preparação', cls: 'bg-warning/15 text-warning', icon: '🔥' },
  'item-ready': { label: 'Marcou como pronto', cls: 'bg-success/15 text-success', icon: '✅' },
  'item-served': { label: 'Marcou como servido', cls: 'bg-primary/15 text-primary', icon: '🍽️' },
  'item-pending': { label: 'Pendente', cls: 'bg-muted text-muted-foreground', icon: '⏳' },
  'receipt-printed': { label: 'Recibo impresso', cls: 'bg-primary/15 text-primary', icon: '🧾' },
  'served-items-printed': { label: 'Itens servidos impressos', cls: 'bg-success/15 text-success', icon: '🖨️' },
};

function EventsLogPanel({ order }: { order: Order }) {
  const events = [...(order.events ?? [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-foreground">Log de eventos</h3>
        <span className="text-xs text-muted-foreground">{events.length} registo(s)</span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">
          Nenhum evento registado ainda.
        </div>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {events.map(ev => {
            const meta = EVENT_LABELS[ev.type] ?? EVENT_LABELS['item-pending'];
            const date = new Date(ev.at);
            const dateLabel = date.toLocaleString('pt', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            return (
              <div key={ev.id} className="flex items-center gap-3 p-3 bg-secondary/20">
                <span className="text-xl shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md mr-2', meta.cls)}>
                      {meta.label}
                    </span>
                    {ev.itemName && <span className="font-medium">{ev.itemName}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.actor ? `${ev.actor.name} · ${ev.actor.role}` : 'Sistema'} — {dateLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
