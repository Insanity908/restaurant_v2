import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, UtensilsCrossed, ChefHat, CreditCard, BarChart3, Settings, Coffee, Package, LogOut, Users, Clock, UserCircle, Receipt, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOptionalAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
import { useLicense } from '@/hooks/useLicense';


const navItems = [
  { path: '/admin', icon: ShieldCheck, label: 'Super Admin' },
  { path: '/', icon: LayoutGrid, label: 'Dashboard' },
  { path: '/menu', icon: UtensilsCrossed, label: 'Cardápio' },
  { path: '/tables', icon: Coffee, label: 'Mesas' },
  { path: '/kitchen', icon: ChefHat, label: 'Cozinha' },
  { path: '/pos', icon: CreditCard, label: 'Caixa' },
  { path: '/inventory', icon: Package, label: 'Inventário' },
  { path: '/reports', icon: BarChart3, label: 'Relatórios' },
  { path: '/staff', icon: Users, label: 'Funcionários' },
  { path: '/customers', icon: UserCircle, label: 'Clientes' },
  { path: '/shifts', icon: Clock, label: 'Turnos' },
  { path: '/billing', icon: Receipt, label: 'Faturação' },
  { path: '/settings', icon: Settings, label: 'Configurações' },
];

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin', admin: 'Administrador', manager: 'Gerente', cashier: 'Caixa', waiter: 'Garçom', kitchen: 'Cozinha',
};

export default function AppSidebar() {
  const location = useLocation();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const logout = auth?.logout;
  const { settings } = useSettings();
  const { tenant, status, daysLeft } = useLicense();


  if (!user) return null;

  const visibleItems = navItems.filter(item => {
    const allowed = ROUTE_PERMISSIONS[item.path];
    return !allowed || allowed.includes(user.role);
  });

  return (
    <aside className="fixed left-0 top-0 z-40 h-full w-16 lg:w-56 glass-strong flex flex-col items-center lg:items-stretch py-4 gap-1">
      <div className="flex items-center gap-2 px-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden">
          {settings.iconUrl ? (
            <img src={settings.iconUrl} alt="logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl leading-none">{settings.iconEmoji || '☕'}</span>
          )}
        </div>
        <span className="hidden lg:block font-heading font-bold text-sm text-foreground whitespace-pre-line leading-tight">
          {settings.brandName}
        </span>
      </div>


      <nav className="flex-1 flex flex-col gap-1 w-full px-2 overflow-y-auto">
        {visibleItems.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all touch-target',
                'hover:bg-secondary/80',
                active && 'bg-primary/15 text-primary'
              )}
            >
              <Icon className={cn('w-5 h-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('hidden lg:block text-sm font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-2 w-full space-y-2">
        <div className="hidden lg:block px-2 py-2 rounded-lg bg-secondary/50 border border-border/40">
          <p className="text-xs text-muted-foreground">Sessão</p>
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-[11px] text-primary">{ROLE_LABEL[user.role]}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full justify-center lg:justify-start gap-2 text-muted-foreground hover:text-destructive"
          aria-label="Sair"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden lg:inline">Sair</span>
        </Button>
        {tenant && user.role !== 'superadmin' && (
          <Link to="/billing" className={cn(
            'hidden lg:flex items-center gap-2 px-2 py-1.5 rounded-lg border',
            status === 'active' ? 'bg-success/10 border-success/20 text-success' :
            status === 'trial' ? 'bg-primary/10 border-primary/20 text-primary' :
            'bg-destructive/10 border-destructive/20 text-destructive',
          )}>
            <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span className="text-xs font-medium">
              {status === 'trial' ? `Teste · ${Math.max(0, daysLeft)}d` :
               status === 'active' ? `Ativo · ${Math.max(0, daysLeft)}d` :
               status === 'expired' ? 'Expirado' : 'Bloqueado'}
            </span>
          </Link>
        )}
        <div className="hidden lg:flex items-center gap-2 px-2 py-1.5 rounded-lg bg-success/10 border border-success/20">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-success font-medium">Online</span>
        </div>
      </div>
    </aside>
  );
}
