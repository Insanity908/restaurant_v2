import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { Coffee, Delete, ShieldCheck, KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { securityAlertStore, staffStore } from '@/lib/store';
import { Staff, UserRole } from '@/types/restaurant';
import { isSuperAdminInitialized, initializeSuperAdmin, SUPERADMIN_EMAIL } from '@/lib/superadmin';
import { toast } from 'sonner';

const FAILED_ATTEMPTS_KEY = 'failed_pin_attempts';

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  manager: 'Gerente',
  cashier: 'Caixa',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
};

const ROLE_HOME: Record<UserRole, string> = {
  superadmin: '/admin',
  admin: '/',
  manager: '/',
  cashier: '/pos',
  waiter: '/tables',
  kitchen: '/kitchen',
};

type Mode = 'pin' | 'email';

export default function LoginPage() {
  const { user, loginWithPin, loginWithPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('email');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupPassword, setSetupPassword] = useState('');

  useEffect(() => {
    setStaff(staffStore.getAll());
    setNeedsSetup(!isSuperAdminInitialized());
  }, []);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    const target = from && ROUTE_PERMISSIONS[from]?.includes(user.role) ? from : ROLE_HOME[user.role];
    return <Navigate to={target} replace />;
  }

  const submitPin = (value: string) => {
    if (!/^\d{4,6}$/.test(value)) {
      setError('O PIN deve ter 4 a 6 dígitos');
      return;
    }
    const res = loginWithPin(value);
    if (!res.ok) {
      const attempts = Number(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0') + 1;
      localStorage.setItem(FAILED_ATTEMPTS_KEY, String(attempts));
      if (attempts > 5) {
        securityAlertStore.add({
          type: 'failed-pin',
          message: `Mais de cinco tentativas falhadas de PIN. Última tentativa: ${value}`,
          attemptedPin: value,
          attempts,
        });
      }
      setError(res.error || 'Erro');
      setPin('');
      setTimeout(() => setError(null), 1500);
    } else {
      localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      navigate('/', { replace: true });
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await loginWithPassword(email, password);
    if (!res.ok) {
      setError(res.error || 'Credenciais inválidas');
    }
  };

  const setupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword.length < 6) return toast.error('Password deve ter pelo menos 6 caracteres');
    await initializeSuperAdmin(setupPassword);
    setNeedsSetup(false);
    toast.success(`Super-admin criado: ${SUPERADMIN_EMAIL}`);
    setEmail(SUPERADMIN_EMAIL);
    setPassword(setupPassword);
    setSetupPassword('');
  };

  const press = (digit: string) => {
    setError(null);
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 6) submitPin(next);
  };

  const back = () => { setError(null); setPin(p => p.slice(0, -1)); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            <Coffee className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">Sabor POS</h1>
          <p className="text-xs text-muted-foreground">
            {needsSetup ? 'Configure a conta de super-admin' : 'Entre na sua conta'}
          </p>
        </div>

        {needsSetup ? (
          <form onSubmit={setupAdmin} className="space-y-3">
            <div className="glass rounded-lg p-3 text-xs text-muted-foreground">
              Primeira execução. Defina a password do super-admin (<code>{SUPERADMIN_EMAIL}</code>).
            </div>
            <div className="space-y-1.5">
              <Label>Password do super-admin</Label>
              <Input type="password" value={setupPassword} onChange={e => setSetupPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Criar super-admin</Button>
          </form>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-secondary/40">
              <button
                onClick={() => { setMode('email'); setError(null); }}
                className={cn('text-xs py-2 rounded-md font-medium flex items-center justify-center gap-1.5',
                  mode === 'email' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                <Mail className="w-3.5 h-3.5" />Gerente / Admin
              </button>
              <button
                onClick={() => { setMode('pin'); setError(null); }}
                className={cn('text-xs py-2 rounded-md font-medium flex items-center justify-center gap-1.5',
                  mode === 'pin' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                <KeyRound className="w-3.5 h-3.5" />Equipa (PIN)
              </button>
            </div>

            {mode === 'email' ? (
              <form onSubmit={submitEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full">Entrar</Button>
                <p className="text-center text-xs text-muted-foreground">
                  Novo cliente? <Link to="/signup" className="text-primary hover:underline">Criar conta</Link>
                </p>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center gap-3" aria-live="polite">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={cn(
                      'w-4 h-4 rounded-full border-2 transition-all',
                      pin.length > i ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/40',
                      error && 'border-destructive bg-destructive/30 animate-pulse',
                    )} />
                  ))}
                </div>
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <div className="grid grid-cols-3 gap-3">
                  {['1','2','3','4','5','6','7','8','9'].map(d => (
                    <Button key={d} variant="secondary" size="lg" className="h-16 text-xl font-bold touch-target" onClick={() => press(d)}>{d}</Button>
                  ))}
                  <div />
                  <Button variant="secondary" size="lg" className="h-16 text-xl font-bold touch-target" onClick={() => press('0')}>0</Button>
                  <Button variant="ghost" size="lg" className="h-16 touch-target" onClick={back} aria-label="Apagar">
                    <Delete className="w-6 h-6" />
                  </Button>
                </div>
                <Button className="w-full h-12" disabled={pin.length < 4} onClick={() => submitPin(pin)}>Entrar</Button>
              </div>
            )}

            {mode === 'pin' && staff.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer flex items-center gap-2 justify-center hover:text-foreground transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5" />Utilizadores de demonstração
                </summary>
                <ul className="mt-3 space-y-1 bg-secondary/40 rounded-lg p-3">
                  {staff.map(s => (
                    <li key={s.id} className="flex justify-between">
                      <span>{s.name} <span className="opacity-60">({ROLE_LABELS[s.role]})</span></span>
                      <code className="text-primary">{s.pin}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
