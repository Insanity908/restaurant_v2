import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RequireAuthProps {
  children: ReactNode;
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading, logout } = useAuth();
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

  const allowed = ROUTE_PERMISSIONS[location.pathname];
  if (allowed && !allowed.includes(user.role)) {
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

  return <>{children}</>;
}
