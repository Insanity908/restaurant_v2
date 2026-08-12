import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, UtensilsCrossed, ChefHat, CreditCard, BarChart3, Settings, Coffee, Package, LogOut, Users, Clock, UserCircle, ShieldCheck, MoreHorizontal, ChevronsUpDown, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOptionalAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
import { useLicense } from '@/hooks/useLicense';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { tenantStore } from '@/lib/tenants';
import { useStorageImage } from '@/hooks/useStorageImage';
import { LOGO_BUCKET } from '@/lib/storage';


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
  { path: '/settings', icon: Settings, label: 'Configurações' },
];

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super Admin', admin: 'Administrador', manager: 'Gerente', cashier: 'Caixa', waiter: 'Garçom', kitchen: 'Cozinha',
};

const MOBILE_PRIMARY = ['/', '/menu', '/tables', '/kitchen', '/pos'];

function TenantSwitcher() {
  const auth = useOptionalAuth();
  const user = auth?.user;
  if (!user || user.role !== 'admin') return null;
  const ids = user.tenantIds || [];
  if (ids.length === 0) return null;

  const all = tenantStore.getAll();
  const owned = all.filter(t => ids.includes(t.id));
  const current = tenantStore.current();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-border/50 bg-secondary/40 hover:bg-secondary/60 text-left">
          <Coffee className="w-4 h-4 text-primary shrink-0" />
          <div className="hidden lg:block flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground leading-none">Restaurante</p>
            <p className="text-xs font-semibold truncate">{current?.name || 'Selecionar'}</p>
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground hidden lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-64">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">Os seus restaurantes</DropdownMenuLabel>
        {owned.map(t => (
          <DropdownMenuItem key={t.id} onClick={() => auth?.switchTenant(t.id)} className="cursor-pointer">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{t.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{t.id}</p>
            </div>
            {current?.id === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/onboarding" className="cursor-pointer">
            <Plus className="w-3.5 h-3.5 mr-2" /> Adicionar restaurante
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppSidebar() {
  const location = useLocation();
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const logout = auth?.logout;
  const { settings } = useSettings();
  const { tenant, status, daysLeft } = useLicense();
  const iconUrl = useStorageImage(LOGO_BUCKET, settings.iconUrl);

  if (!user) return null;

  const visibleItems = navItems.filter(item => {
    const allowed = ROUTE_PERMISSIONS[item.path];
    return !allowed || allowed.includes(user.role);
  });

  const mobilePrimary = visibleItems.filter(i => MOBILE_PRIMARY.includes(i.path));
  const mobileMore = visibleItems.filter(i => !MOBILE_PRIMARY.includes(i.path));

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 z-40 h-full w-16 lg:w-56 glass-strong flex-col items-center lg:items-stretch py-4 gap-1">
        <div className="flex items-center gap-2 px-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden">
            {iconUrl ? (
              <img src={iconUrl} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl leading-none">{settings.iconEmoji || '☕'}</span>
            )}

          </div>
          <span className="hidden lg:block font-heading font-bold text-sm text-foreground whitespace-pre-line leading-tight">
            {settings.brandName}
          </span>
        </div>

        <div className="px-2 mb-3 w-full">
          <TenantSwitcher />
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
          {tenant && user.role === 'admin' && (
            <div className={cn(
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
            </div>
          )}
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-border/60 flex items-stretch justify-around px-1 pt-1 pb-[env(safe-area-inset-bottom)]">
        {mobilePrimary.map(({ path, icon: Icon, label }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-md min-w-0',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-medium truncate max-w-full">{label}</span>
            </Link>
          );
        })}
        {mobileMore.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-md',
                  mobileMore.some(i => i.path === location.pathname) ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-label="Mais"
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">Mais</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56 mb-1">
              {mobileMore.map(({ path, icon: Icon, label }) => (
                <DropdownMenuItem key={path} asChild>
                  <Link to={path} className="flex items-center gap-2 cursor-pointer">
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </>
  );
}
