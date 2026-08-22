import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getOrderStatus, type OrderStatusView } from '@/lib/customerOrder';
import { formatPrice } from '@/lib/helpers';
import { cn } from '@/lib/utils';
import { CheckCircle2, ChefHat, Clock, Loader2, HandPlatter } from 'lucide-react';

const ITEM_LABELS: Record<string, string> = {
  pending: 'Pendente', preparing: 'A preparar', ready: 'Pronto', served: 'Servido',
};

const ORDER_LABELS: Record<string, { label: string; icon: typeof Clock }> = {
  'awaiting-confirmation': { label: 'Aguarda confirmação do restaurante', icon: Clock },
  active: { label: 'Confirmado — a preparar', icon: ChefHat },
  preparing: { label: 'A preparar', icon: ChefHat },
  ready: { label: 'Pronto', icon: HandPlatter },
  completed: { label: 'Concluído', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', icon: Clock },
};

export default function CustomerTrackingPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<OrderStatusView | null | undefined>(undefined);

  // Página pública/anon — não pode ler `orders` directamente (só a RPC
  // SECURITY DEFINER get_order_status), por isso o Realtime aqui é
  // Broadcast Authorization (tópico "order:<uuid>", ver migration
  // 20260822160000) em vez do `postgres_changes` usado em subscribeOperations.
  // Broadcast não repõe eventos perdidos enquanto desligado — por isso
  // recarrega o estado sempre que o canal (re)conecta, não só uma vez.
  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const load = async () => {
      const data = await getOrderStatus(orderId);
      if (active) setOrder(data);
    };

    const channel = supabase.channel(`order:${orderId}`, { config: { private: true } });
    (['INSERT', 'UPDATE', 'DELETE'] as const).forEach(event => {
      channel.on('broadcast', { event }, () => { void load(); });
    });
    channel.subscribe(status => { if (status === 'SUBSCRIBED') void load(); });

    return () => { active = false; void supabase.removeChannel(channel); };
  }, [orderId]);

  if (order === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground">Pedido não encontrado.</p>
      </div>
    );
  }

  const statusInfo = ORDER_LABELS[order.status] ?? { label: order.status, icon: Clock };
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-4">
        <div className="glass rounded-2xl p-5 text-center space-y-2">
          <StatusIcon className={cn(
            'w-10 h-10 mx-auto',
            order.status === 'cancelled' ? 'text-destructive' : order.status === 'completed' ? 'text-success' : 'text-primary',
          )} />
          <h1 className="font-heading text-lg font-bold">{statusInfo.label}</h1>
          <p className="text-xs text-muted-foreground">
            {order.type === 'dine-in' && order.tableNumber ? `Mesa ${order.tableNumber}` : 'Entrega'} · Pedido #{order.id.slice(-4)}
          </p>
        </div>

        <div className="glass rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Itens</h2>
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm">
              <span>{item.quantity}x {item.name}</span>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap',
                item.status === 'pending' && 'bg-warning/15 text-warning',
                item.status === 'preparing' && 'bg-primary/15 text-primary',
                item.status === 'ready' && 'bg-success/15 text-success',
                item.status === 'served' && 'bg-muted text-muted-foreground',
              )}>
                {ITEM_LABELS[item.status] ?? item.status}
              </span>
            </div>
          ))}
        </div>

        <div className="glass rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-heading font-bold">{formatPrice(order.total)}</span>
        </div>
      </div>
    </div>
  );
}
