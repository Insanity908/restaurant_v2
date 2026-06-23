import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Lock, CreditCard, LogOut } from 'lucide-react';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';

export default function BlockedPage() {
  const { tenant, status } = useLicense();
  const { logout } = useAuth();
  const sub = tenant?.subscription;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-destructive/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/15 flex items-center justify-center">
          <Lock className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="font-heading text-2xl font-bold">Acesso bloqueado</h1>
        <p className="text-sm text-muted-foreground">
          {status === 'blocked'
            ? sub?.blockReason || 'A sua conta foi bloqueada pelo administrador. Contacte-o para regularizar.'
            : 'A sua subscrição expirou. Renove o seu pacote para continuar a usar o sistema.'}
        </p>
        {tenant?.subscription.expiresAt && (
          <p className="text-xs text-muted-foreground">
            Expirou em: {new Date(tenant.subscription.expiresAt).toLocaleDateString('pt-MZ')}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-2">
          {status !== 'blocked' && (
            <Link to="/pricing"><Button className="w-full"><CreditCard className="w-4 h-4" />Renovar agora</Button></Link>
          )}
          <Button variant="outline" onClick={logout}><LogOut className="w-4 h-4" />Sair</Button>
        </div>
      </div>
    </div>
  );
}
