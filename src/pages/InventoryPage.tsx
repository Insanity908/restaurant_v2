import { useRef, useState } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { formatPrice, truncateList } from '@/lib/helpers';
import { InventoryItem } from '@/types/restaurant';
import { Package, AlertTriangle, Plus, Pencil, Trash2, X, Search, ImagePlus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { uploadTenantImage, MENU_BUCKET } from '@/lib/storage';
import { recordInventoryAdjustment, fetchInventoryMovements, InventoryMovement } from '@/lib/inventoryMovements';
import { useStorageImage } from '@/hooks/useStorageImage';
import StorageImage from '@/components/StorageImage';
import DismissibleAlert from '@/components/DismissibleAlert';
import ImagePickerDialog from '@/components/ImagePickerDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function InventoryPage() {
  const {
    inventory, lowStockItems, menuItems,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
  } = useRestaurant();
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('inventory.edit');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'zero'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState({
    name: '', unit: 'un', currentStock: 0, minStock: 0,
    costPerUnit: 0, linkedMenuItemIds: [] as string[], usagePerServing: 1,
    icon: '', image: undefined as string | undefined,
  });
  const formImageUrl = useStorageImage(MENU_BUCKET, form.image);

  const resetForm = () => setForm({
    name: '', unit: 'un', currentStock: 0, minStock: 0,
    costPerUnit: 0, linkedMenuItemIds: [], usagePerServing: 1,
    icon: '', image: undefined,
  });

  const openCreate = () => { resetForm(); setEditing(null); setDialogOpen(true); };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name, unit: item.unit, currentStock: item.currentStock,
      minStock: item.minStock, costPerUnit: item.costPerUnit,
      linkedMenuItemIds: item.linkedMenuItemIds, usagePerServing: item.usagePerServing,
      icon: item.icon || '', image: item.image,
    });
    setDialogOpen(true);
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Imagem muito grande (máx 3MB)'); return; }
    setUploading(true);
    try {
      const path = await uploadTenantImage(MENU_BUCKET, file);
      setForm(f => ({ ...f, image: path }));
    } catch (err) {
      toast.error(`Falha ao carregar imagem: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const hasInvalidNumbers = form.currentStock < 0 || form.minStock < 0 || form.costPerUnit < 0;

  const handleSave = () => {
    if (!form.name || hasInvalidNumbers) return;
    const { icon, image, ...rest } = form;
    const payload = { ...rest, icon: icon.trim() || undefined, image };
    if (editing) {
      updateInventoryItem(editing.id, payload);
      if (payload.currentStock !== editing.currentStock) {
        recordInventoryAdjustment(editing.id, payload.currentStock - editing.currentStock, user?.name ?? 'Equipa');
      }
    } else {
      addInventoryItem(payload);
    }
    setDialogOpen(false);
    resetForm();
    setEditing(null);
  };

  const openHistory = (item: InventoryItem) => {
    setHistoryItem(item);
    setHistory([]);
    setHistoryLoading(true);
    fetchInventoryMovements(item.id).then(rows => { setHistory(rows); setHistoryLoading(false); });
  };

  const displayed = inventory
    .filter(i => filter === 'low' ? i.currentStock <= i.minStock : filter === 'zero' ? i.currentStock === 0 : true)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const totalValue = inventory.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0);

  return (
    <PageShell title="Inventário" subtitle="Controlo de stock e ingredientes">
      {/* Low stock alert banner */}
      {lowStockItems.length > 0 && (
        <DismissibleAlert dismissKey={lowStockItems.map(i => i.id).sort().join(',')} className="mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Stock Baixo — {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'itens'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {truncateList(lowStockItems.map(i => i.name))}
              </p>
            </div>
          </div>
        </DismissibleAlert>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Itens', value: inventory.length, icon: Package, color: 'text-primary' },
          { label: 'Stock Baixo', value: lowStockItems.length, icon: AlertTriangle, color: 'text-warning' },
          { label: 'Valor Total', value: formatPrice(totalValue), icon: Package, color: 'text-success' },
          { label: 'Sem Stock', value: inventory.filter(i => i.currentStock === 0).length, icon: AlertTriangle, color: 'text-destructive' },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-4">
            <s.icon className={cn('w-5 h-5 mb-2', s.color)} />
            <p className="text-xl font-heading font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar ingrediente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'low', 'zero'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              )}
            >
              {f === 'all' ? 'Todos' : f === 'low' ? 'Stock Baixo' : 'Sem Stock'}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Novo
          </Button>
        )}
      </div>

      {/* Inventory table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium">Ingrediente</th>
                <th className="text-left p-3 font-medium">Stock</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Mín.</th>
                <th className="text-left p-3 font-medium hidden md:table-cell">Custo/Un.</th>
                <th className="text-left p-3 font-medium hidden lg:table-cell">Valor</th>
                {canEdit && <th className="text-right p-3 font-medium">Acções</th>}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {displayed.map(item => {
                  const isLow = item.currentStock <= item.minStock;
                  const stockPct = item.minStock > 0 ? Math.min(100, (item.currentStock / (item.minStock * 3)) * 100) : 100;

                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={cn('border-b border-border/50 hover:bg-secondary/30 transition-colors', isLow && 'bg-warning/5')}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
                          {item.image ? (
                            <StorageImage
                              bucket={MENU_BUCKET}
                              path={item.image}
                              alt={item.name}
                              className="w-6 h-6 rounded-md object-cover shrink-0"
                            />
                          ) : item.icon ? (
                            <span className="text-lg shrink-0">{item.icon}</span>
                          ) : null}
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', isLow ? 'bg-warning' : 'bg-success')}
                              style={{ width: `${stockPct}%` }}
                            />
                          </div>
                          <span className={cn('text-xs font-mono', isLow ? 'text-warning' : 'text-foreground')}>
                            {item.currentStock} {item.unit}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{item.minStock} {item.unit}</td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{formatPrice(item.costPerUnit)}</td>
                      <td className="p-3 hidden lg:table-cell text-foreground font-medium">
                        {formatPrice(item.currentStock * item.costPerUnit)}
                      </td>
                      {canEdit && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openHistory(item)}
                              className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                              aria-label="Histórico"
                            >
                              <History className="w-3.5 h-3.5 text-foreground" />
                            </button>
                            <button
                              onClick={() => openEdit(item)}
                              className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                              aria-label="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5 text-foreground" />
                            </button>
                            <button
                              onClick={() => setItemToDelete(item)}
                              className="w-7 h-7 rounded-full bg-destructive/20 hover:bg-destructive/30 flex items-center justify-center"
                              aria-label="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {displayed.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum ingrediente encontrado</div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground font-heading">
              {editing ? 'Editar Ingrediente' : 'Novo Ingrediente'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                onClick={() => fileRef.current?.click()}
                className="relative w-14 h-14 shrink-0 rounded-xl bg-secondary border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex items-center justify-center overflow-hidden transition-colors group"
              >
                {formImageUrl ? (
                  <img src={formImageUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
                {uploading && <div className="absolute inset-0 bg-background/60 flex items-center justify-center text-[9px] text-muted-foreground">A carregar…</div>}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-muted-foreground text-xs">Ícone (emoji) — opcional se tiver foto</Label>
                <Input
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  placeholder="🧀"
                  maxLength={4}
                  className="bg-secondary border-border text-center w-20"
                />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="w-full gap-2">
              <ImagePlus className="w-3.5 h-3.5" /> Escolher da galeria
            </Button>
            <ImagePickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onSelect={path => setForm(f => ({ ...f, image: path }))}
            />
            <div>
              <Label className="text-muted-foreground text-xs">Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Unidade</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['un', 'kg', 'g', 'L', 'mL'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-muted-foreground text-xs">Stock Actual</Label>
                <Input type="number" min={0} value={form.currentStock === 0 ? '' : form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: e.target.value === '' ? 0 : +e.target.value }))} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Stock Mínimo</Label>
                <Input type="number" min={0} value={form.minStock === 0 ? '' : form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value === '' ? 0 : +e.target.value }))} className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Custo por Unidade (MT)</Label>
              <Input type="number" min={0} value={form.costPerUnit === 0 ? '' : form.costPerUnit} onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value === '' ? 0 : +e.target.value }))} className="bg-secondary border-border mt-1" />
            </div>
            {hasInvalidNumbers && (
              <p className="text-xs text-destructive -mt-2">Stock e custo não podem ser negativos.</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              A ligação a pratos e o uso por porção são definidos na receita de cada prato em <strong>Menu</strong>.
            </p>
            <Button onClick={handleSave} className="w-full" disabled={!form.name.trim() || hasInvalidNumbers}>{editing ? 'Guardar' : 'Adicionar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyItem} onOpenChange={(open) => { if (!open) setHistoryItem(null); }}>
        <DialogContent className="glass-strong border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground font-heading">
              Histórico · {historyItem?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">A carregar…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem movimentos registados.</p>
            ) : (
              history.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-secondary/40">
                  <div className="min-w-0">
                    <span className={cn('font-semibold', m.delta >= 0 ? 'text-success' : 'text-destructive')}>
                      {m.delta >= 0 ? '+' : ''}{m.delta} {historyItem?.unit}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      {m.reason}{m.createdByName ? ` · ${m.createdByName}` : ''}
                    </span>
                  </div>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {new Date(m.createdAt).toLocaleString('pt-PT')}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => { if (!open) setItemToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {itemToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {itemToDelete && itemToDelete.linkedMenuItemIds.length > 0 ? (
                <>
                  Este ingrediente está ligado a{' '}
                  <strong>
                    {truncateList(
                      itemToDelete.linkedMenuItemIds
                        .map(id => menuItems.find(m => m.id === id)?.name)
                        .filter((n): n is string => !!n),
                    )}
                  </strong>
                  . Esses pratos ficam com a receita sem este ingrediente. Esta ação não pode ser desfeita.
                </>
              ) : (
                'Esta ação não pode ser desfeita.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (itemToDelete) deleteInventoryItem(itemToDelete.id); setItemToDelete(null); }}
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