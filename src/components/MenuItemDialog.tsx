import { useState, useEffect, useRef } from 'react';
import { MenuItem, Modifier, Recipe, RecipeIngredient, RecipeStep, InventoryItem } from '@/types/restaurant';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ImagePlus, ChefHat, Package, AlertCircle } from 'lucide-react';
import { validateQtyAgainstUnit } from '@/lib/units';
import { toast } from 'sonner';

const CATEGORIES = ['Popular', 'Entradas', 'Pratos Principais', 'Bebidas', 'Sobremesas'];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<MenuItem, 'id'> & { id?: string }) => void;
  item?: MenuItem | null;
  inventory?: InventoryItem[];
}

export default function MenuItemDialog({ open, onClose, onSave, item, inventory = [] }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [available, setAvailable] = useState(true);
  const [image, setImage] = useState<string | undefined>();
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [steps, setSteps] = useState<RecipeStep[]>([]);
  const [temp, setTemp] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setPrice(String(item.price));
      setCategory(item.category);
      setDescription(item.description || '');
      setAvailable(item.available);
      setImage(item.image);
      setModifiers(item.modifiers || []);
      setIngredients(item.recipe?.ingredients || []);
      setSteps(item.recipe?.steps || []);
      setTemp(item.recipe?.temp || '');
    } else {
      setName(''); setPrice(''); setCategory(CATEGORIES[0]);
      setDescription(''); setAvailable(true); setImage(undefined); setModifiers([]);
      setIngredients([]); setSteps([]); setTemp('');
    }
  }, [item, open]);

  const addModifier = () => {
    setModifiers(prev => [...prev, { id: `mod-${Date.now()}`, name: '', price: 0 }]);
  };

  const updateModifier = (idx: number, field: keyof Modifier, value: string | number) => {
    setModifiers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  };

  const removeModifier = (idx: number) => {
    setModifiers(prev => prev.filter((_, i) => i !== idx));
  };

  // Recipe — ingredients
  const addIngredient = () => setIngredients(prev => [...prev, { name: '', qty: '', icon: '🍽️' }]);
  const updateIngredient = (idx: number, field: keyof RecipeIngredient, value: string) =>
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing));
  const removeIngredient = (idx: number) => setIngredients(prev => prev.filter((_, i) => i !== idx));

  // Recipe — steps
  const addStep = () => setSteps(prev => [...prev, { label: '', icon: '👨‍🍳' }]);
  const updateStep = (idx: number, field: keyof RecipeStep, value: string) =>
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  const removeStep = (idx: number) => setSteps(prev => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Per-ingredient unit validation (only for linked ingredients)
  const ingredientErrors: (string | null)[] = ingredients.map(ing => {
    if (!ing.inventoryItemId) return null;
    const linked = inventory.find(inv => inv.id === ing.inventoryItemId);
    if (!linked) return null;
    if (!ing.name.trim()) return null;
    return validateQtyAgainstUnit(ing.qty, linked.unit);
  });
  const hasIngredientErrors = ingredientErrors.some(e => !!e);

  const handleSubmit = () => {
    if (!name.trim() || !price) return;
    if (hasIngredientErrors) {
      toast.error('Corrija as quantidades dos ingredientes ligados ao inventário');
      return;
    }
    const validModifiers = modifiers.filter(m => m.name.trim());
    const validIngredients = ingredients.filter(i => i.name.trim());
    const validSteps = steps.filter(s => s.label.trim());
    const recipe: Recipe | undefined =
      validIngredients.length || validSteps.length || temp.trim()
        ? {
            ingredients: validIngredients.map(i => ({ ...i, name: i.name.trim(), qty: i.qty.trim(), icon: i.icon?.trim() || undefined })),
            steps: validSteps.map(s => ({ ...s, label: s.label.trim(), icon: s.icon?.trim() || undefined })),
            temp: temp.trim() || undefined,
          }
        : undefined;
    onSave({
      ...(item ? { id: item.id } : {}),
      name: name.trim(),
      price: Number(price),
      category,
      description: description.trim() || undefined,
      available,
      image,
      modifiers: validModifiers.length > 0 ? validModifiers : undefined,
      recipe,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto glass-strong border-border">
        <DialogHeader>
          <DialogTitle className="font-heading">{item ? 'Editar Item' : 'Novo Item do Menu'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative w-full aspect-video rounded-xl bg-secondary border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex items-center justify-center overflow-hidden transition-colors group"
          >
            {image ? (
              <img src={image} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                <ImagePlus className="w-8 h-8" />
                <span className="text-sm font-medium">Carregar Imagem</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </div>

          {/* Name & Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pizza Margherita" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Preço (MT)</Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" className="bg-secondary border-border" />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Categoria</Label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-secondary text-secondary-foreground rounded-lg px-3 py-2 text-sm border border-border"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição breve do item..." className="bg-secondary border-border resize-none" rows={2} />
          </div>

          {/* Availability */}
          <div className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Disponível</p>
              <p className="text-xs text-muted-foreground">Mostrar no cardápio</p>
            </div>
            <Switch checked={available} onCheckedChange={setAvailable} />
          </div>

          {/* Modifiers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs">Modificadores</Label>
              <Button variant="ghost" size="sm" onClick={addModifier} className="text-primary h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>
            {modifiers.map((mod, idx) => (
              <div key={mod.id} className="flex items-center gap-2">
                <Input
                  value={mod.name}
                  onChange={e => updateModifier(idx, 'name', e.target.value)}
                  placeholder="Ex: Queijo extra"
                  className="bg-secondary border-border flex-1 h-9 text-sm"
                />
                <Input
                  type="number"
                  value={mod.price || ''}
                  onChange={e => updateModifier(idx, 'price', Number(e.target.value))}
                  placeholder="MT"
                  className="bg-secondary border-border w-24 h-9 text-sm"
                />
                <Button variant="ghost" size="icon" onClick={() => removeModifier(idx)} className="h-9 w-9 text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Recipe (Ingredients + Steps) — used by KDS */}
          <div className="space-y-3 rounded-xl bg-secondary/30 border border-border/50 p-3">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-primary" />
              <Label className="text-foreground text-sm font-medium">Receita (Cozinha)</Label>
            </div>

            {/* Ingredients */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">Ingredientes</Label>
                <Button variant="ghost" size="sm" onClick={addIngredient} className="text-primary h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {ingredients.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sem ingredientes — será usado um padrão.</p>
              )}
              {ingredients.map((ing, idx) => {
                const linked = inventory.find(inv => inv.id === ing.inventoryItemId);
                return (
                  <div key={idx} className="space-y-1.5 rounded-lg bg-secondary/40 p-2 border border-border/40">
                    <div className="flex items-center gap-2">
                      <Input
                        value={ing.icon || ''}
                        onChange={e => updateIngredient(idx, 'icon', e.target.value)}
                        placeholder="🧀"
                        className="bg-secondary border-border w-12 h-9 text-sm text-center"
                        maxLength={4}
                      />
                      <Input
                        value={ing.name}
                        onChange={e => updateIngredient(idx, 'name', e.target.value)}
                        placeholder="Ex: Mozzarella"
                        className="bg-secondary border-border flex-1 h-9 text-sm"
                        disabled={!!linked}
                      />
                      {linked ? (
                        <div className="relative w-28">
                          <Input
                            type="number"
                            step="any"
                            value={(ing.qty.match(/[\d]+([.,][\d]+)?/)?.[0] || '').replace(',', '.')}
                            onChange={e => updateIngredient(idx, 'qty', e.target.value ? `${e.target.value} ${linked.unit}` : '')}
                            placeholder="0"
                            className="bg-secondary border-border h-9 text-sm pr-10"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {linked.unit}
                          </span>
                        </div>
                      ) : (
                        <Input
                          value={ing.qty}
                          onChange={e => updateIngredient(idx, 'qty', e.target.value)}
                          placeholder="200g"
                          className="bg-secondary border-border w-24 h-9 text-sm"
                        />
                      )}
                      <Button variant="ghost" size="icon" onClick={() => removeIngredient(idx)} className="h-9 w-9 text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 pl-14">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <Select
                        value={ing.inventoryItemId || '__none__'}
                        onValueChange={v => {
                          if (v === '__none__') {
                            updateIngredient(idx, 'inventoryItemId', '');
                          } else {
                            const inv = inventory.find(i => i.id === v);
                            setIngredients(prev => prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    inventoryItemId: v,
                                    name: inv?.name || item.name,
                                    qty: item.qty || (inv ? `${inv.usagePerServing} ${inv.unit}` : item.qty),
                                  }
                                : item,
                            ));
                          }
                        }}
                      >
                        <SelectTrigger className="bg-secondary border-border h-7 text-xs flex-1">
                          <SelectValue placeholder="Ligar ao inventário (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem ligação</SelectItem>
                          {inventory.map(inv => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.name} ({inv.currentStock} {inv.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {ingredientErrors[idx] && (
                      <div className="flex items-center gap-1.5 pl-14 text-xs text-destructive">
                        <AlertCircle className="w-3 h-3" />
                        <span>{ingredientErrors[idx]}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">Passos de Preparo</Label>
                <Button variant="ghost" size="sm" onClick={addStep} className="text-primary h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sem passos — será usado um padrão.</p>
              )}
              {steps.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveStep(idx, -1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▲</button>
                    <button type="button" onClick={() => moveStep(idx, 1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▼</button>
                  </div>
                  <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                  <Input
                    value={s.icon || ''}
                    onChange={e => updateStep(idx, 'icon', e.target.value)}
                    placeholder="🔥"
                    className="bg-secondary border-border w-12 h-9 text-sm text-center"
                    maxLength={4}
                  />
                  <Input
                    value={s.label}
                    onChange={e => updateStep(idx, 'label', e.target.value)}
                    placeholder="Ex: Levar ao forno a 220°C por 10 min"
                    className="bg-secondary border-border flex-1 h-9 text-sm"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeStep(idx)} className="h-9 w-9 text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Temp / Time */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Tempo / Temperatura (opcional)</Label>
              <Input
                value={temp}
                onChange={e => setTemp(e.target.value)}
                placeholder="Ex: 220°C / 10m"
                className="bg-secondary border-border h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !price || hasIngredientErrors}>
            {item ? 'Salvar Alterações' : 'Criar Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
