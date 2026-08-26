import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { UserRole } from '@/types/restaurant';

const ROLE_HOME: Record<UserRole, string> = {
  superadmin: '/admin',
  admin: '/',
  manager: '/',
  cashier: '/pos',
  waiter: '/tables',
  kitchen: '/kitchen',
};

export default function LoginPage() {
  const { user, loginWithPassword, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    const target = from && ROUTE_PERMISSIONS[from]?.includes(user.role) ? from : ROLE_HOME[user.role];
    return <Navigate to={target} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await loginWithPassword(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Credenciais inválidas');
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    const res = await signInWithGoogle();
    setBusy(false);
    if (!res.ok) setError(res.error || 'Erro no Google Sign-in');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            <Coffee className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">Sabor POS</h1>
          <p className="text-xs text-muted-foreground">Entre na sua conta</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="login-identifier">Email ou telefone</Label>
            <Input id="login-identifier" type="text" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">Esqueci a password</Link>
            </div>
            <PasswordInput id="login-password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'A entrar…' : 'Entrar'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.5l2.63-2.53C16.9 3.34 14.68 2.4 12 2.4 6.98 2.4 2.9 6.48 2.9 11.5s4.08 9.1 9.1 9.1c5.25 0 8.72-3.68 8.72-8.86 0-.6-.07-1.06-.16-1.54H12z"/>
          </svg>
          Continuar com Google
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Novo cliente? <Link to="/signup" className="text-primary hover:underline">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
