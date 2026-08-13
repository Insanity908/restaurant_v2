import { useState, useEffect } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { getMenuItemImage, formatPrice } from '@/lib/helpers';
import { MenuItem, Modifier, OrderItem } from '@/types/restaurant';
import { Plus, Minus, ShoppingCart, X, Pencil, Trash2, Settings2, PlusCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import MenuItemDialog from '@/components/MenuItemDialog';
import StorageImage from '@/components/StorageImage';
import { MENU_BUCKET } from '@/lib/storage';
import { printProforma } from '@/lib/proforma';
import { loadSettings } from '@/lib/settings';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const categories = ['Popular', 'Entradas', 'Pratos Principais', 'Bebidas', 'Sobremesas'];

export default function MenuPage() {
  const { menuItems, tables, orders, inventory, createOrder, appendOrderItems, generateId, addMenuItem, updateMenuItem, deleteMenuItem } = useRestaurant();
  const location = useLocation();
  const navState = (location.state ?? {}) as { addToOrderId?: string; tableId?: string; tableNumber?: number };
  const addToOrderId = navState.addToOrderId;
  const targetOrder = addToOrderId ? orders.find(o => o.id === addToOrderId) : undefined;

  const [activeCategory, setActiveCategory] = useState('Popular');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>(navState.tableId ?? '');
  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway' | 'delivery'>('dine-in');
  const [manageMode, setManageMode] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [tableError, setTableError] = useState(false);
  const [proformaOpen, setProformaOpen] = useState(false);
  const [proformaSel, setProformaSel] = useState<Set<string>>(new Set());
  const [modifierPickItem, setModifierPickItem] = useState<MenuItem | null>(null);
  const [pickedModIds, setPickedModIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canProforma = hasPermission('proforma.print');
  const canEditMenu = hasPermission('menu.edit');

  useEffect(() => {
    if (navState.tableId) setSelectedTable(navState.tableId);
  }, [navState.tableId]);

  const filtered = manageMode
    ? menuItems.filter(item => item.category === activeCategory)
    : menuItems.filter(item => item.category === activeCategory && item.available);
  // When adding to an existing order, allow selecting the occupied target table too
  const tablesForSelect = addToOrderId
    ? tables.filter(t => t.status === 'free' || t.id === navState.tableId)
    : tables.filter(t => t.status === 'free');
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Chave da combinação de modificadores de uma linha do carrinho — duas
  // linhas do mesmo prato só se juntam (soma quantidade) se escolheram
  // exatamente os mesmos modificadores; combinações diferentes ficam em
  // linhas separadas para a cozinha não as confundir.
  const modifierKey = (mods?: Modifier[]) =>
    mods && mods.length > 0 ? [...mods].map(m => m.id).sort().join(',') : '';

  const addToCart = (menuItem: MenuItem, modifiers?: Modifier[]) => {
    if (manageMode) return;
    const key = modifierKey(modifiers);
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === menuItem.id && modifierKey(i.modifiers) === key);
      if (existing) {
        return prev.map(i => i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      const extra = (modifiers ?? []).reduce((s, m) => s + m.price, 0);
      return [...prev, {
        id: generateId(),
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price + extra,
        modifiers: modifiers && modifiers.length > 0 ? modifiers : undefined,
        status: 'pending' as const,
      }];
    });
  };

  const handleItemClick = (item: MenuItem) => {
    if (manageMode) return;
    if (item.modifiers && item.modifiers.length > 0) {
      setPickedModIds(new Set());
      setModifierPickItem(item);
    } else {
      addToCart(item);
    }
  };

  const confirmModifierPick = () => {
    if (!modifierPickItem) return;
    const chosen = modifierPickItem.modifiers?.filter(m => pickedModIds.has(m.id)) ?? [];
    addToCart(modifierPickItem, chosen);
    setModifierPickItem(null);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(i => i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter(i => i.quantity > 0));
  };

  const submitOrder = () => {
    if (cart.length === 0) return;
    if (addToOrderId && targetOrder) {
      const ok = appendOrderItems(addToOrderId, cart);
      if (ok) {
        toast.success(`Itens adicionados à Mesa ${targetOrder.tableNumber ?? ''}`);
        setCart([]);
        setShowCart(false);
        navigate('/kitchen');
      } else {
        toast.error('Não foi possível adicionar ao pedido');
      }
      return;
    }
    if (orderType === 'dine-in' && !selectedTable) {
      setTableError(true);
      toast.error('Selecione uma mesa para continuar');
      return;
    }
    const table = tables.find(t => t.id === selectedTable);
    createOrder({
      tableId: selectedTable || undefined,
      tableNumber: table?.number,
      type: orderType,
      items: cart,
      status: 'active',
      total: cartTotal,
      paid: false,
    });
    setCart([]);
    setShowCart(false);
    setTableError(false);
    navigate('/kitchen');
  };

  const handleSave = (data: Omit<MenuItem, 'id'> & { id?: string }) => {
    if (data.id) {
      const { id, ...updates } = data;
      updateMenuItem(id, updates);
    } else {
      addMenuItem(data);
    }
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  return (
    <PageShell title="O que deseja pedir hoje?" subtitle="Selecione os itens do cardápio">
      {addToOrderId && targetOrder && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <PlusCircle className="w-4 h-4 text-success shrink-0" />
            <span className="text-foreground">
              A adicionar itens ao pedido da <strong>Mesa {targetOrder.tableNumber}</strong> · #{targetOrder.id.slice(-4)}
            </span>
          </div>
          <button
            onClick={() => navigate('/tables')}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      )}
      {/* Top bar: categories + manage toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1 snap-x">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium whitespace-nowrap transition-all snap-start shrink-0',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
          {canProforma && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setProformaSel(new Set()); setProformaOpen(true); }}
              className="shrink-0 gap-1.5"
            >
              <FileText className="w-4 h-4" />
              Proforma
            </Button>
          )}
          {canEditMenu && (
            <Button
              variant={manageMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setManageMode(!manageMode)}
              className="shrink-0 gap-1.5"
            >
              <Settings2 className="w-4 h-4" />
              {manageMode ? 'Fechar' : 'Gerir'}
            </Button>
          )}
        </div>
      </div>

      {/* Add new item button in manage mode */}
      {manageMode && canEditMenu && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Item
          </Button>
        </motion.div>
      )}

      {/* Menu Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map(item => {
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'glass rounded-xl overflow-hidden group relative',
                !manageMode && 'cursor-pointer',
                !item.available && 'opacity-60'
              )}
              onClick={() => handleItemClick(item)}
            >
              <div className="aspect-[4/3] bg-secondary overflow-hidden">
                <StorageImage
                  bucket={MENU_BUCKET}
                  path={item.image}
                  fallbackSrc={getMenuItemImage(item.name)}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  placeholder={<div className="w-full h-full flex items-center justify-center text-muted-foreground text-2xl">🍽️</div>}
                />
              </div>


              {/* Unavailable badge */}
              {!item.available && (
                <div className="absolute top-2 left-2 bg-destructive/90 text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Indisponível
                </div>
              )}

              {/* Modifier count badge */}
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                  +{item.modifiers.length} mod
                </div>
              )}

              <div className="p-3">
                <h2 className="text-sm font-medium text-foreground line-clamp-2">{item.name}</h2>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-bold text-primary">{formatPrice(item.price)}</span>
                  {manageMode ? (
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={item.available}
                        onCheckedChange={(v) => {
                          updateMenuItem(item.id, { available: v });
                        }}
                        className="scale-75"
                        onClick={e => e.stopPropagation()}
                        aria-label={item.available ? `Marcar "${item.name}" como indisponível` : `Marcar "${item.name}" como disponível`}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); handleEdit(item); }}
                        className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
                        aria-label={`Editar ${item.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-foreground" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMenuItem(item.id); }}
                        className="w-7 h-7 rounded-full bg-destructive/20 hover:bg-destructive/30 flex items-center justify-center transition-colors"
                        aria-label={`Remover ${item.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  ) : (
                    <button className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                      <Plus className="w-4 h-4 text-primary-foreground" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cart Bar */}
      {cartCount > 0 && !manageMode && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed left-0 md:left-16 lg:left-56 right-0 bottom-16 md:bottom-0 p-3 md:p-4 z-30"
        >
          <button
            onClick={() => setShowCart(true)}
            className="w-full glass-strong rounded-2xl p-3 md:p-4 flex items-center justify-between gap-2 hover:bg-card/100 transition-colors"
          >
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <span className="text-foreground font-bold text-sm md:text-base truncate">{formatPrice(cartTotal)}</span>
              <span className="bg-primary/20 text-primary text-xs md:text-sm px-2 py-0.5 rounded-full font-medium shrink-0">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
            </div>
            <span className="bg-primary text-primary-foreground px-3 md:px-6 py-2 md:py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-1.5 md:gap-2 shrink-0">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Finalizar Pedido</span>
              <span className="sm:hidden">Finalizar</span>
            </span>
          </button>
        </motion.div>
      )}

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setShowCart(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md glass-strong z-50 flex flex-col"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-heading font-bold text-lg text-foreground">Confirmação do Pedido</h2>
                <button onClick={() => setShowCart(false)} className="touch-target flex items-center justify-center">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.map(item => {
                  const img = getMenuItemImage(item.name);
                  return (
                    <div key={item.id} className="flex items-center gap-3 bg-secondary/50 rounded-xl p-3">
                      {img && <img src={img} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[11px] text-primary truncate">+ {item.modifiers.map(m => m.name).join(', ')}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center touch-target">
                          <Minus className="w-3 h-3 text-foreground" />
                        </button>
                        <span className="text-sm font-bold text-foreground w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full bg-primary flex items-center justify-center touch-target">
                          <Plus className="w-3 h-3 text-primary-foreground" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-foreground w-20 text-right">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-border space-y-4">
                <div className="flex items-center justify-between text-foreground font-bold">
                  <span>Total a Pagar:</span>
                  <span className="text-lg">{formatPrice(cartTotal)}</span>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground font-medium">Tipo de Pedido:</p>
                  <div className="flex gap-2">
                    {(['dine-in', 'takeaway', 'delivery'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setOrderType(type)}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-xs font-medium transition-all',
                          orderType === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        {type === 'dine-in' ? 'Mesa' : type === 'takeaway' ? 'Takeaway' : 'Entrega'}
                      </button>
                    ))}
                  </div>
                </div>

                {orderType === 'dine-in' && (
                  <div className="space-y-1">
                    <select
                      value={selectedTable}
                      onChange={e => { setSelectedTable(e.target.value); if (e.target.value) setTableError(false); }}
                      className={cn(
                        'w-full bg-secondary text-secondary-foreground rounded-lg px-3 py-2.5 text-sm border',
                        tableError && !selectedTable ? 'border-destructive' : 'border-transparent',
                      )}
                    >
                      <option value="">Selecionar Mesa</option>
                      {tablesForSelect.map(t => (
                        <option key={t.id} value={t.id}>Mesa {t.number} ({t.seats} lugares)</option>
                      ))}
                    </select>
                    {tableError && !selectedTable && (
                      <p className="text-xs text-destructive">Mesa obrigatória para pedidos no local.</p>
                    )}
                  </div>
                )}

                <button
                  onClick={submitOrder}
                  disabled={cart.length === 0 || (orderType === 'dine-in' && !selectedTable && !addToOrderId)}
                  className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar Pedido
                  <span className="text-lg">→</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Menu Item Dialog */}
      <MenuItemDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingItem(null); }}
        onSave={handleSave}
        item={editingItem}
        inventory={inventory}
      />

      {/* Proforma Dialog */}
      <Dialog open={proformaOpen} onOpenChange={setProformaOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fatura Proforma</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Selecione os pratos a incluir. Se nenhum for selecionado, imprime todos os pratos disponíveis.
            </p>
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Button size="sm" variant="outline" onClick={() => setProformaSel(new Set(menuItems.map(i => i.id)))}>Selecionar todos</Button>
              <Button size="sm" variant="ghost" onClick={() => setProformaSel(new Set())}>Limpar</Button>
              <span className="text-xs text-muted-foreground ml-auto">{proformaSel.size} selecionados</span>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {menuItems.map(i => (
                <label key={i.id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/40 cursor-pointer">
                  <Checkbox
                    checked={proformaSel.has(i.id)}
                    onCheckedChange={(v) => {
                      setProformaSel(prev => {
                        const next = new Set(prev);
                        if (v) next.add(i.id); else next.delete(i.id);
                        return next;
                      });
                    }}
                  />
                  <span className="flex-1 text-sm truncate">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{i.category}</span>
                  <span className="text-sm font-medium">{formatPrice(i.price)}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProformaOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              const settings = loadSettings();
              const list = proformaSel.size > 0
                ? menuItems.filter(i => proformaSel.has(i.id))
                : menuItems.filter(i => i.available);
              if (list.length === 0) { toast.error('Nenhum prato para imprimir'); return; }
              printProforma({
                items: list,
                brand: settings.brandName,
                address: settings.address,
                taxId: settings.taxId,
                phone: settings.phone,
                logoUrl: settings.receiptShowLogo ? settings.receiptLogo : undefined,
              });
              setProformaOpen(false);
            }}>
              <FileText className="w-4 h-4" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifiers Dialog — escolher 0, 1 ou vários modificadores antes de ir para a cozinha */}
      <Dialog open={!!modifierPickItem} onOpenChange={v => !v && setModifierPickItem(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>{modifierPickItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground pb-1">Escolha os extras deste prato (opcional).</p>
            {modifierPickItem?.modifiers?.map(mod => (
              <label key={mod.id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/40 cursor-pointer">
                <Checkbox
                  checked={pickedModIds.has(mod.id)}
                  onCheckedChange={(v) => {
                    setPickedModIds(prev => {
                      const next = new Set(prev);
                      if (v) next.add(mod.id); else next.delete(mod.id);
                      return next;
                    });
                  }}
                />
                <span className="flex-1 text-sm">{mod.name}</span>
                {mod.price > 0 && <span className="text-xs text-muted-foreground">+{formatPrice(mod.price)}</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModifierPickItem(null)}>Cancelar</Button>
            <Button onClick={confirmModifierPick}>
              Adicionar · {formatPrice(
                (modifierPickItem?.price ?? 0) +
                (modifierPickItem?.modifiers?.filter(m => pickedModIds.has(m.id)).reduce((s, m) => s + m.price, 0) ?? 0)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

