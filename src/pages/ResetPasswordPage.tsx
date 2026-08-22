import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Coffee, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const { updatePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password deve ter pelo menos 8 caracteres'); return; }
    if (password !== confirm) { setError('Passwords não coincidem'); return; }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) {
      // Sessão de recuperação em falta/expirada — o link do email só é
      // válido uma vez e por tempo limitado.
      setError(res.error?.includes('session') ? 'Este link expirou ou já foi usado. Peça um novo.' : (res.error || 'Não foi possível actualizar a password.'));
      return;
    }
    setDone(true);
    // Sessão de recuperação fica activa até logout — força novo login com a
    // password nova, em vez de deixar o utilizador "meio-autenticado" aqui.
    void logout();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            {done ? <CheckCircle2 className="w-7 h-7 text-success" /> : <Coffee className="w-7 h-7 text-primary" />}
          </div>
          <h1 className="font-heading text-xl font-bold">{done ? 'Password actualizada' : 'Nova password'}</h1>
          {!done && <p className="text-xs text-muted-foreground">Escolha uma nova password para a sua conta.</p>}
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              A sua password foi actualizada. Entre novamente com a nova password.
            </p>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>Ir para o login</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova password</Label>
              <PasswordInput id="new-password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar password</Label>
              <PasswordInput id="confirm-password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
            {error && (
              <div className="space-y-1.5">
                <p className="text-sm text-destructive">{error}</p>
                {error.includes('expirou') && (
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">Pedir novo link</Link>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'A actualizar…' : 'Actualizar password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
