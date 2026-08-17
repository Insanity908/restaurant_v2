import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  fetchPublicMenu, verifyLoyaltyCustomer, submitCustomerOrder,
  type PublicMenuItem, type LoyaltyCustomer,
} from '@/lib/customerOrder';
import { formatPrice } from '@/lib/helpers';
import { maskMzPhone, validateMzMobile } from '@/lib/validators';
import StorageImage from '@/components/StorageImage';
import { MENU_BUCKET } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Minus, ShoppingCart, MapPin, Phone, Loader2 } from 'lucide-react';

interface CartLine {
  item: PublicMenuItem;
  quantity: number;
  notes: string;
}

export default function CustomerOrderPage() {
  const { tenantId, tableId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDelivery = !tableId;
  const tableNumber = searchParams.get('n');

  const [menu, setMenu] = useState<PublicMenuItem[] | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = useState(false);

  // Fluxo de entrega: telefone tem de já estar registado na fidelização, e
  // o cliente indica/confirma a morada para este pedido (nunca assumimos
  // que a morada guardada, se existir, ainda está correta).
  const [phone, setPhone] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [customer, setCustomer] = useState<LoyaltyCustomer | null>(null);
  const [phoneChecked, setPhoneChecked] = useState(false);
  const [address, setAddress] = useState('');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetchPublicMenu(tenantId).then(setMenu);
  }, [tenantId]);

  const categories = useMemo(() => {
    if (!menu) return [];
    return Array.from(new Set(menu.map(m => m.category)));
  }, [menu]);

  const lines = Object.values(cart).filter(l => l.quantity > 0);
  const cartTotal = lines.reduce((s, l) => s + l.item.price * l.quantity, 0);
  const cartCount = lines.reduce((s, l) => s + l.quantity, 0);

  const setQty = (item: PublicMenuItem, quantity: number) => {
    setCart(prev => ({
      ...prev,
      [item.id]: { item, quantity: Math.max(0, quantity), notes: prev[item.id]?.notes ?? '' },
    }));
  };

  const setNotes = (item: PublicMenuItem, notes: string) => {
    setCart(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { item, quantity: 0 }), notes } }));
  };

  const handleVerifyPhone = async () => {
    if (!tenantId) return;
    const err = validateMzMobile(phone);
    if (err) { toast.error(err); return; }
    setVerifying(true);
    const found = await verifyLoyaltyCustomer(tenantId, phone);
    setVerifying(false);
    setPhoneChecked(true);
    setCustomer(found);
    setAddress(found?.address ?? '');
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) { toast.error('O seu navegador não suporta partilhar localização.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        setAddress(prev => (prev.trim() ? `${prev.trim()}\n${link}` : link));
      },
      err => {
        setLocating(false);
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Permissão de localização negada. Ative-a nas definições do navegador ou escreva a morada.'
          : 'Não foi possível obter a sua localização. Tente escrever a morada.';
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = async () => {
    if (!tenantId || lines.length === 0) return;
    if (isDelivery && !customer) { toast.error('Confirme primeiro o seu telefone de cliente registado'); return; }
    if (isDelivery && !address.trim()) { toast.error('Indique a morada de entrega'); return; }
    setSubmitting(true);
    const orderId = await submitCustomerOrder({
      tenantId,
      tableId: isDelivery ? undefined : tableId,
      customerPhone: isDelivery ? phone : undefined,
      customerName: customer?.name,
      deliveryAddress: isDelivery ? address.trim() : undefined,
      items: lines.map(l => ({ menuItemId: l.item.id, quantity: l.quantity, notes: l.notes || undefined })),
    });
    setSubmitting(false);
    if (!orderId) { toast.error('Não foi possível enviar o pedido. Tente novamente ou chame um funcionário.'); return; }
    navigate(`/pedido/${orderId}`);
  };

  if (isDelivery && !customer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm glass rounded-2xl p-6 space-y-4">
          <div className="text-center space-y-1">
            <MapPin className="w-8 h-8 mx-auto text-primary" />
            <h1 className="font-heading text-lg font-bold">Pedido para entrega</h1>
            <p className="text-sm text-muted-foreground">
              Só clientes já registados na fidelização podem pedir entrega. Introduza o seu telefone.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="cust-phone">Telefone</label>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                id="cust-phone"
                value={phone}
                onChange={e => { setPhone(maskMzPhone(e.target.value)); setPhoneChecked(false); }}
                placeholder="84 123 4567"
                inputMode="numeric"
              />
            </div>
          </div>
          {phoneChecked && !customer && (
            <p className="text-xs text-destructive">
              Ainda não é cliente registado. Fale com o restaurante para se registar na fidelização antes de pedir entrega.
            </p>
          )}
          <Button className="w-full" onClick={handleVerifyPhone} disabled={verifying}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </Button>
        </div>
      </div>
    );
  }

  if (isDelivery && customer && !addressConfirmed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm glass rounded-2xl p-6 space-y-4">
          <div className="text-center space-y-1">
            <MapPin className="w-8 h-8 mx-auto text-primary" />
            <h1 className="font-heading text-lg font-bold">Olá, {customer.name}</h1>
            <p className="text-sm text-muted-foreground">Para onde é a entrega desta vez?</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="cust-address">Morada de entrega</label>
            <Textarea
              id="cust-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua, bairro, ponto de referência..."
              rows={3}
            />
          </div>
          <Button type="button" variant="outline" className="w-full gap-2" onClick={handleShareLocation} disabled={locating}>
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Enviar a minha localização (Google Maps)
          </Button>
          <Button className="w-full" onClick={() => {
            if (!address.trim()) { toast.error('Indique a morada de entrega'); return; }
            setAddressConfirmed(true);
          }}>
            Continuar para o cardápio
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border p-4">
        <h1 className="font-heading text-lg font-bold">Cardápio</h1>
        <p className="text-sm text-muted-foreground">
          {isDelivery
            ? `Entrega para ${customer?.name} · ${address}`
            : `Mesa ${tableNumber ?? ''}`}
        </p>
      </div>

      {menu === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : menu.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">Cardápio indisponível de momento.</p>
      ) : (
        <div className="p-4 space-y-6">
          {categories.map(cat => (
            <section key={cat}>
              <h2 className="font-heading text-sm font-semibold text-muted-foreground mb-2">{cat}</h2>
              <div className="space-y-2">
                {menu.filter(m => m.category === cat).map(item => {
                  const line = cart[item.id];
                  const qty = line?.quantity ?? 0;
                  return (
                    <div key={item.id} className="glass rounded-xl p-3 flex items-center gap-3">
                      <StorageImage
                        bucket={MENU_BUCKET}
                        path={item.image}
                        alt={item.name}
                        className="w-14 h-14 rounded-lg object-cover shrink-0"
                        placeholder={<div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center text-xl shrink-0">🍽️</div>}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                        <p className="text-sm font-semibold text-primary">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {qty > 0 && (
                          <button
                            onClick={() => setQty(item, qty - 1)}
                            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center"
                            aria-label={`Remover ${item.name}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        )}
                        {qty > 0 && <span className="w-5 text-center text-sm font-medium">{qty}</span>}
                        <button
                          onClick={() => setQty(item, qty + 1)}
                          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                          aria-label={`Adicionar ${item.name}`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {lines.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-heading text-sm font-semibold">O seu pedido</h2>
              {lines.map(l => (
                <div key={l.item.id} className="glass rounded-xl p-3 space-y-1.5">
                  <p className="text-sm font-medium">{l.quantity}x {l.item.name}</p>
                  <Textarea
                    value={l.notes}
                    onChange={e => setNotes(l.item, e.target.value)}
                    placeholder="Notas (opcional) — ex: sem cebola"
                    rows={1}
                    className="text-xs resize-none"
                  />
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-background border-t border-border p-4">
          <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            Fazer pedido · {cartCount} {cartCount === 1 ? 'item' : 'itens'} · {formatPrice(cartTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}
