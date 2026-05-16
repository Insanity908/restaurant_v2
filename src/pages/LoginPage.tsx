import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, ROUTE_PERMISSIONS } from '@/context/AuthContext';
import { Coffee, Delete, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { securityAlertStore, staffStore } from '@/lib/store';
import { Staff, UserRole } from '@/types/restaurant';

const FAILED_ATTEMPTS_KEY = 'failed_pin_attempts';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  cashier: 'Caixa',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
};

const ROLE_HOME: Record<UserRole, string> = {
  admin: '/',
  manager: '/',
  cashier: '/pos',
  waiter: '/tables',
  kitchen: '/kitchen',
};

export default function LoginPage() {
  const { user, loginWithPin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);

  useEffect(() => {
    setStaff(staffStore.getAll());
  }, []);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    const target = from && ROUTE_PERMISSIONS[from]?.includes(user.role) ? from : ROLE_HOME[user.role];
    return <Navigate to={target} replace />;
  }

  const submit = (value: string) => {
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
          message: `Mais de cinco tentativas falhadas de PIN foram registadas. Última tentativa: ${value}`,
          attemptedPin: value,
          attempts,
        });
      }
      setError(res.error || 'Erro');
      setPin('');
      setTimeout(() => setError(null), 1500);
    } else {
      localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      // Navigation via re-render above
      navigate('/', { replace: true });
    }
  };

  const press = (digit: string) => {
    setError(null);
    const next = (pin + digit).slice(0, 6);
    setPin(next);
    if (next.length === 6) submit(next);
  };

  const back = () => {
    setError(null);
    setPin(p => p.slice(0, -1));
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            <Coffee className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">SABOR DE NAMPULA</h1>
          <p className="text-sm text-muted-foreground">Digite o seu PIN de 4 a 6 dígitos</p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3" aria-live="polite">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-4 rounded-full border-2 transition-all',
                pin.length > i ? 'bg-primary border-primary scale-110' : 'border-muted-foreground/40',
                error && 'border-destructive bg-destructive/30 animate-pulse',
              )}
            />
          ))}
        </div>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <Button
              key={d}
              variant="secondary"
              size="lg"
              className="h-16 text-xl font-bold touch-target"
              onClick={() => press(d)}
            >
              {d}
            </Button>
          ))}
          <div />
          <Button variant="secondary" size="lg" className="h-16 text-xl font-bold touch-target" onClick={() => press('0')}>0</Button>
          <Button variant="ghost" size="lg" className="h-16 touch-target" onClick={back} aria-label="Apagar">
            <Delete className="w-6 h-6" />
          </Button>
        </div>

        <Button className="w-full h-12" disabled={pin.length < 4} onClick={() => submit(pin)}>
          Entrar
        </Button>

        {/* Quick hint of seeded users */}
        {staff.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer flex items-center gap-2 justify-center hover:text-foreground transition-colors">
              <ShieldCheck className="w-3.5 h-3.5" />
              Utilizadores de demonstração
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
      </div>
    </div>
  );
}
