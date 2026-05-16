import { useState } from 'react';
import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { formatPrice } from '@/lib/helpers';
import { InventoryItem } from '@/types/restaurant';
import { Package, AlertTriangle, Plus, Pencil, Trash2, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function InventoryPage() {
  const {
    inventory, lowStockItems, menuItems,
    addInventoryItem, updateInventoryItem, deleteInventoryItem,
  } = useRestaurant();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: '', unit: 'un', currentStock: 0, minStock: 0,
    costPerUnit: 0, linkedMenuItemIds: [] as string[], usagePerServing: 1,
  });

  const resetForm = () => setForm({
    name: '', unit: 'un', currentStock: 0, minStock: 0,
    costPerUnit: 0, linkedMenuItemIds: [], usagePerServing: 1,
  });

  const openCreate = () => { resetForm(); setEditing(null); setDialogOpen(true); };
  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name, unit: item.unit, currentStock: item.currentStock,
      minStock: item.minStock, costPerUnit: item.costPerUnit,
      linkedMenuItemIds: item.linkedMenuItemIds, usagePerServing: item.usagePerServing,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name) return;
    if (editing) {
      updateInventoryItem(editing.id, form);
    } else {
      addInventoryItem(form);
    }
    setDialogOpen(false);
    resetForm();
    setEditing(null);
  };

  const displayed = inventory
    .filter(i => filter === 'low' ? i.currentStock <= i.minStock : true)
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const totalValue = inventory.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0);

  return (
    <PageShell title="Inventário" subtitle="Controlo de stock e ingredientes">
      {/* Low stock alert banner */}
      {lowStockItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-warning">Stock Baixo — {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'itens'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lowStockItems.map(i => i.name).join(', ')}
            </p>
          </div>
        </motion.div>
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
          {(['all', 'low'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              )}
            >
              {f === 'all' ? 'Todos' : 'Stock Baixo'}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo
        </Button>
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
                <th className="text-right p-3 font-medium">Acções</th>
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
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center"
                          >
                            <Pencil className="w-3.5 h-3.5 text-foreground" />
                          </button>
                          <button
                            onClick={() => deleteInventoryItem(item.id)}
                            className="w-7 h-7 rounded-full bg-destructive/20 hover:bg-destructive/30 flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </div>
                      </td>
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
                <Input type="number" value={form.currentStock} onChange={e => setForm(f => ({ ...f, currentStock: +e.target.value }))} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Stock Mínimo</Label>
                <Input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: +e.target.value }))} className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Custo por Unidade (MT)</Label>
              <Input type="number" value={form.costPerUnit} onChange={e => setForm(f => ({ ...f, costPerUnit: +e.target.value }))} className="bg-secondary border-border mt-1" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              A ligação a pratos e o uso por porção são definidos na receita de cada prato em <strong>Menu</strong>.
            </p>
            <Button onClick={handleSave} className="w-full">{editing ? 'Guardar' : 'Adicionar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}