import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Coffee, Plus } from 'lucide-react';
import { useOptionalAuth } from '@/context/AuthContext';
import { tenantStore, hasProfessionalSibling } from '@/lib/tenants';
import { PLANS, formatMT, applyMultiRestaurantDiscount } from '@/lib/billing';
import { toast } from 'sonner';

interface RestaurantSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Trocar entre restaurantes do utilizador ou criar mais um, partilhado entre
 * o desktop (AppSidebar > TenantSwitcher) e o menu "Mais" do mobile — o
 * backend (createTenant/bootstrap-tenant com additional:true) já suporta
 * isto, só faltava um ponto de entrada fora do onboarding inicial.
 */
export default function RestaurantSwitcherDialog({ open, onOpenChange }: RestaurantSwitcherDialogProps) {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [discountEligible, setDiscountEligible] = useState(false);

  const ids = user?.tenantIds || [];
  const current = tenantStore.current();

  useEffect(() => {
    if (!open || !current) { setDiscountEligible(false); return; }
    hasProfessionalSibling(ids, current.id).then(setDiscountEligible).catch(() => setDiscountEligible(false));
    // ids é um array novo a cada render — comparar só o conteúdo relevante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, ids.join(',')]);

  if (!user) return null;

  const owned = tenantStore.getAll().filter(t => ids.includes(t.id));

  const create = async () => {
    if (!newName.trim() || !user.email) return;
    setCreating(true);
    const { tenant: t, error } = await tenantStore.create({ name: newName.trim(), ownerEmail: user.email, ownerName: user.name });
    setCreating(false);
    if (!t) { toast.error(error ?? 'Não foi possível criar o restaurante'); return; }
    tenantStore.setCurrent(t.id);
    toast.success(`Restaurante "${t.name}" criado`);
    setTimeout(() => window.location.reload(), 400);
  };

  const basicPrice = applyMultiRestaurantDiscount(PLANS['basic-monthly'].price, discountEligible);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Os seus restaurantes</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {owned.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => auth?.switchTenant(t.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/60 text-left"
            >
              <Coffee className="w-4 h-4 text-primary shrink-0" />
              <span className="flex-1 min-w-0 text-sm truncate">{t.name}</span>
              {current?.id === t.id && <Check className="w-4 h-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <Label htmlFor="new-restaurant-name">Adicionar restaurante</Label>
          <p className="text-[11px] text-muted-foreground">
            Começa com 7 dias grátis. Depois disso, precisa da sua própria subscrição
            (a partir de {formatMT(basicPrice)}/mês) para continuar activo — ver /billing.
            {discountEligible && ' Como já tem um restaurante Profissional, este tem 20% de desconto.'}
          </p>
          <div className="flex gap-2">
            <Input
              id="new-restaurant-name"
              placeholder="Ex: Sabor de Maputo"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <Button onClick={create} disabled={!newName.trim() || creating}>
              <Plus className="w-4 h-4" />{creating ? 'A criar…' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
