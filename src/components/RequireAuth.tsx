import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RequireLicense from '@/components/RequireLicense';

interface RequireAuthProps {
  children: ReactNode;
}

// Rotas cujo acesso pode ser estendido a papéis normalmente não incluídos em
// ROUTE_PERMISSIONS, desde que o utilizador tenha a permissão indicada
// (atribuída pelo administrador em Funcionários > Permissões).
//
// Vazio de propósito: no fluxo oficial, /settings, /billing, /pricing e
// /onboarding são exclusivos do admin (ver ROUTE_PERMISSIONS). O mecanismo
// fica pronto para o dia em que quiseres reabrir /billing ao gerente — basta
// voltar a adicionar '/billing': 'billing.manage' aqui.
const PERMISSION_OVERRIDES: Partial<Record<string, Parameters<ReturnType<typeof useAuth>['hasPermission']>[0]>> = {};

export default function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading, logout, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Google Sign-In (unlike email signup) never calls bootstrap-tenant, so a
  // brand-new Google user has a role (defaults to 'admin') but zero
  // tenants — every tenant-scoped feature then breaks ("sem restaurante
  // ativo", brand name stuck on the placeholder, faturação "sessão
  // inválida") even though the route itself was reachable. Send them to
  // onboarding to create their first restaurant, same as email signup does.
  if (user.role !== 'superadmin' && user.tenantIds.length === 0 && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  const allowed = ROUTE_PERMISSIONS[location.pathname];
  const overridePerm = PERMISSION_OVERRIDES[location.pathname];
  const allowedByRole = !allowed || allowed.includes(user.role);
  const allowedByPermission = !!overridePerm && hasPermission(overridePerm);
  if (!allowedByRole && !allowedByPermission) {
    return (
      <div className="ml-16 lg:ml-56 min-h-screen p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 glass-strong p-8 rounded-xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/15 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="font-heading text-xl font-bold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            O seu perfil <span className="text-foreground font-medium">{user.role}</span> não tem permissão para aceder a esta página.
          </p>
          <Button variant="outline" onClick={logout}>Trocar de utilizador</Button>
        </div>
      </div>
    );
  }

  return <RequireLicense>{children}</RequireLicense>;
}
