import PageShell from '@/components/PageShell';
import { useRestaurant } from '@/hooks/useRestaurant';
import { useAuth } from '@/context/AuthContext';
import { useLicense } from '@/hooks/useLicense';
import { formatPrice, truncateList } from '@/lib/helpers';
import { TrendingUp, ShoppingBag, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import DismissibleAlert from '@/components/DismissibleAlert';

export default function DashboardPage() {
  const { orders, activeOrders, menuItems, tables, lowStockItems } = useRestaurant();
  const { user } = useAuth();
  const { status: licenseStatus, daysLeft } = useLicense();
  const showExpiryWarning = user?.role === 'admin' && (licenseStatus === 'trial' || licenseStatus === 'active') && daysLeft <= 7;

  const completedOrders = orders.filter(o => o.paid);
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total + (o.tip || 0), 0);
  const occupiedTables = tables.filter(t => t.status === 'occupied').length;

  const stats = [
    { label: 'Receita Total', value: formatPrice(totalRevenue), icon: DollarSign, color: 'text-success' },
    { label: 'Pedidos Completos', value: completedOrders.length.toString(), icon: ShoppingBag, color: 'text-primary' },
    { label: 'Pedidos Activos', value: activeOrders.length.toString(), icon: Clock, color: 'text-warning' },
    { label: 'Mesas Ocupadas', value: `${occupiedTables}/${tables.length}`, icon: TrendingUp, color: 'text-foreground' },
  ];

  // Best sellers
  const itemSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  completedOrders.forEach(order => {
    order.items.forEach(item => {
      if (!itemSales[item.menuItemId]) {
        itemSales[item.menuItemId] = { name: item.name, qty: 0, revenue: 0 };
      }
      itemSales[item.menuItemId].qty += item.quantity;
      itemSales[item.menuItemId].revenue += item.price * item.quantity;
    });
  });
  const bestSellers = Object.values(itemSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

  return (
    <PageShell title="Dashboard" subtitle="Visão geral do restaurante">
      {/* Aviso de expiração de plano */}
      {showExpiryWarning && (
        <DismissibleAlert dismissKey={`expiry-${licenseStatus}-${daysLeft}`} tone={daysLeft <= 2 ? 'destructive' : 'warning'} className="mb-6">
          <Link to="/billing" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <Clock className={`w-5 h-5 shrink-0 ${daysLeft <= 2 ? 'text-destructive' : 'text-warning'}`} />
            <div className="flex-1">
              <p className={`text-sm font-medium ${daysLeft <= 2 ? 'text-destructive' : 'text-warning'}`}>
                {licenseStatus === 'trial' ? 'O seu período de teste' : 'O seu plano'} termina {daysLeft <= 0 ? 'hoje' : `em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Renove agora para não perder o acesso ao sistema.</p>
            </div>
          </Link>
        </DismissibleAlert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <DismissibleAlert dismissKey={lowStockItems.map(i => i.id).sort().join(',')} className="mb-6">
          <Link to="/inventory" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">Alerta de Stock Baixo — {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'itens'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{truncateList(lowStockItems.map(i => i.name))}</p>
            </div>
          </Link>
        </DismissibleAlert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="glass rounded-2xl p-5">
          <h2 className="font-heading font-bold text-foreground mb-4">Pedidos Recentes</h2>
          {completedOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum pedido concluído</p>
          ) : (
            <div className="space-y-3">
              {completedOrders.slice(-5).reverse().map(order => (
                <div key={order.id} className="flex items-center justify-between bg-secondary/30 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {order.type === 'dine-in' ? `Mesa ${order.tableNumber}` : order.type}
                    </p>
                    <p className="text-xs text-muted-foreground">{order.items.length} itens</p>
                  </div>
                  <span className="font-bold text-primary text-sm">{formatPrice(order.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Best Sellers */}
        <div className="glass rounded-2xl p-5">
          <h2 className="font-heading font-bold text-foreground mb-4">Mais Vendidos</h2>
          {bestSellers.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem dados de vendas ainda</p>
          ) : (
            <div className="space-y-3">
              {bestSellers.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3 bg-secondary/30 rounded-xl p-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.qty} vendas</p>
                  </div>
                  <span className="text-sm font-bold text-foreground">{formatPrice(item.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
