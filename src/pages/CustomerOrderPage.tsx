import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  fetchPublicMenu, verifyLoyaltyCustomer, submitCustomerOrder, fetchPublicBranding,
  type PublicMenuItem, type LoyaltyCustomer, type PublicBranding,
} from '@/lib/customerOrder';
import { formatPrice } from '@/lib/helpers';
import { maskMzPhone, validateMzMobile } from '@/lib/validators';
import { applyTheme, DEFAULT_SETTINGS } from '@/lib/settings';
import StorageImage from '@/components/StorageImage';
import { MENU_BUCKET, LOGO_BUCKET } from '@/lib/storage';
import { useStorageImage } from '@/hooks/useStorageImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Plus, Minus, ShoppingCart, MapPin, Phone, Loader2, Search, ExternalLink, UtensilsCrossed } from 'lucide-react';

interface CartLine {
  item: PublicMenuItem;
  quantity: number;
  notes: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Um link de mapa embutido na morada (ver handleShareLocation) nunca deve
// aparecer como texto cru no meio da frase — separado para virar um botão.
const MAPS_LINK_RE = /https?:\/\/(?:www\.)?google\.com\/maps\?q=\S+/;
function splitMapLink(raw: string): { text: string; mapUrl?: string } {
  const match = raw.match(MAPS_LINK_RE);
  if (!match) return { text: raw.trim() };
  return { text: raw.replace(match[0], '').trim(), mapUrl: match[0] };
}

function BrandHeader({ branding, size = 'md' }: { branding: PublicBranding | null; size?: 'md' | 'lg' }) {
  const iconUrl = useStorageImage(LOGO_BUCKET, branding?.iconUrl);
  const box = size === 'lg' ? 'w-14 h-14 rounded-2xl text-2xl' : 'w-11 h-11 rounded-xl text-lg';
  return (
    <div className={cn('flex items-center gap-3', size === 'lg' && 'flex-col text-center')}>
      <div className={cn(box, 'bg-primary/15 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0')}>
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>{branding?.iconEmoji || '🍽️'}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className={cn('font-heading font-bold truncate', size === 'lg' ? 'text-lg' : 'text-base')}>
          {branding?.brandName || 'Cardápio'}
        </p>
      </div>
    </div>
  );
}

export default function CustomerOrderPage() {
  const { tenantId, tableId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDelivery = !tableId;
  const tableNumber = searchParams.get('n');

  const [menu, setMenu] = useState<PublicMenuItem[] | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = useState(false);
  // Trava síncrona contra duplo-toque/duplo-clique — `submitting` (estado
  // React) só bloqueia o botão a partir do próximo render, o que deixa uma
  // janela onde dois cliques seguidos disparam dois pedidos reais (com
  // desconto de estoque em dobro). A ref bloqueia já no mesmo instante.
  const submittingRef = useRef(false);
  // Gerada uma vez por visita a esta página e reenviada em qualquer
  // tentativa do mesmo carrinho — ver submitCustomerOrder/submit_customer_order.
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [query, setQuery] = useState('');

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
    // A app da equipa lê a marca/cores de app_settings em localStorage — não
    // existe aqui (é o telemóvel do próprio cliente), por isso vem por uma
    // RPC pública própria (ver get_public_branding). Sem isto o cardápio do
    // cliente não tinha nenhuma identidade visual do restaurante.
    fetchPublicBranding(tenantId).then(b => {
      if (!b) return;
      setBranding(b);
      applyTheme({ ...DEFAULT_SETTINGS, ...b });
    });
  }, [tenantId]);

  const categories = useMemo(() => {
    if (!menu) return ['Todos'];
    return ['Todos', ...Array.from(new Set(menu.map(m => m.category)))];
  }, [menu]);

  const filteredMenu = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.filter(m =>
      (activeCategory === 'Todos' || m.category === activeCategory) &&
      (!q || m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q))
    );
  }, [menu, activeCategory, query]);

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
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const orderId = await submitCustomerOrder({
        tenantId,
        tableId: isDelivery ? undefined : tableId,
        customerPhone: isDelivery ? phone : undefined,
        customerName: customer?.name,
        deliveryAddress: isDelivery ? address.trim() : undefined,
        items: lines.map(l => ({ menuItemId: l.item.id, quantity: l.quantity, notes: l.notes || undefined })),
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (!orderId) { toast.error('Não foi possível enviar o pedido. Tente novamente ou chame um funcionário.'); return; }
      navigate(`/pedido/${orderId}`);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (isDelivery && !customer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <BrandHeader branding={branding} size="lg" />
            <div className="space-y-1">
              <h1 className="font-heading text-lg font-bold">Pedido para entrega</h1>
              <p className="text-sm text-muted-foreground">
                Só clientes já registados na fidelização podem pedir entrega. Introduza o seu telefone.
              </p>
            </div>
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
          <Button className="w-full h-11 rounded-xl" onClick={handleVerifyPhone} disabled={verifying}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
          </Button>
        </div>
      </div>
    );
  }

  if (isDelivery && customer && !addressConfirmed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <BrandHeader branding={branding} size="lg" />
            <div className="space-y-1">
              <h1 className="font-heading text-lg font-bold">Olá, {customer.name}</h1>
              <p className="text-sm text-muted-foreground">Para onde é a entrega desta vez?</p>
            </div>
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
          <Button type="button" variant="outline" className="w-full h-11 rounded-xl gap-2" onClick={handleShareLocation} disabled={locating}>
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Enviar a minha localização (Google Maps)
          </Button>
          <Button className="w-full h-11 rounded-xl" onClick={() => {
            if (!address.trim()) { toast.error('Indique a morada de entrega'); return; }
            setAddressConfirmed(true);
          }}>
            Continuar para o cardápio
          </Button>
        </div>
      </div>
    );
  }

  const { text: addressText, mapUrl } = isDelivery ? splitMapLink(address) : { text: '', mapUrl: undefined };

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-4 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <BrandHeader branding={branding} />
            {!isDelivery && tableNumber && (
              <span className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                Mesa {tableNumber}
              </span>
            )}
          </div>

          {isDelivery && customer && (
            <div className="flex items-center gap-2 text-xs bg-secondary/60 rounded-lg px-3 py-2">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span className="truncate flex-1 text-muted-foreground">
                Entrega para <span className="text-foreground font-medium">{customer.name}</span>
                {addressText ? ` · ${addressText}` : ''}
              </span>
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-primary font-semibold hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Mapa
                </a>
              )}
            </div>
          )}

          {menu !== null && menu.length > 0 && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Pesquisar no cardápio..."
                  className="pl-9 h-10 rounded-xl"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0',
                      activeCategory === cat
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {menu === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : menu.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <UtensilsCrossed className="w-8 h-8 opacity-40" />
          <p className="text-sm">Cardápio indisponível de momento.</p>
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {filteredMenu.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">Nenhum item encontrado.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredMenu.map(item => {
                const line = cart[item.id];
                const qty = line?.quantity ?? 0;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'bg-card rounded-2xl overflow-hidden border transition-shadow',
                      qty > 0 ? 'border-primary/40 shadow-sm' : 'border-border',
                    )}
                  >
                    <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                      <StorageImage
                        bucket={MENU_BUCKET}
                        path={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        placeholder={
                          <div className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-br from-secondary to-secondary/60">
                            🍽️
                          </div>
                        }
                      />
                      {qty === 0 ? (
                        <button
                          onClick={() => setQty(item, 1)}
                          aria-label={`Adicionar ${item.name}`}
                          className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md active:scale-95 transition-transform"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-background/95 backdrop-blur rounded-full px-1 py-1 shadow-md border border-border">
                          <button
                            onClick={() => setQty(item, qty - 1)}
                            aria-label={`Remover ${item.name}`}
                            className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold">{qty}</span>
                          <button
                            onClick={() => setQty(item, qty + 1)}
                            aria-label={`Adicionar ${item.name}`}
                            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-0.5">
                      <p className="text-sm font-semibold leading-snug line-clamp-1">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <p className="text-base font-bold text-primary pt-0.5">{formatPrice(item.price)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lines.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="font-heading text-sm font-bold flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-primary" /> O seu pedido
              </h2>
              {lines.map(l => (
                <div key={l.item.id} className="flex gap-3 bg-card rounded-xl p-2.5 border border-border">
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-secondary shrink-0">
                    <StorageImage
                      bucket={MENU_BUCKET}
                      path={l.item.image}
                      alt={l.item.name}
                      className="w-full h-full object-cover"
                      placeholder={<div className="w-full h-full flex items-center justify-center text-lg">🍽️</div>}
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{l.quantity}x {l.item.name}</p>
                      <p className="text-sm font-semibold text-primary shrink-0">{formatPrice(l.item.price * l.quantity)}</p>
                    </div>
                    <Textarea
                      value={l.notes}
                      onChange={e => setNotes(l.item, e.target.value)}
                      placeholder="Notas (opcional) — ex: sem cebola"
                      rows={1}
                      className="text-xs resize-none min-h-0 h-8 py-1.5"
                    />
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-3 shadow-[0_-6px_20px_rgba(0,0,0,0.12)]">
          <Button className="w-full h-12 gap-2 text-base font-semibold rounded-xl" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
            Fazer pedido · {cartCount} {cartCount === 1 ? 'item' : 'itens'} · {formatPrice(cartTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}
