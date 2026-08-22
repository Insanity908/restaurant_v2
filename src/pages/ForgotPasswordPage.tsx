import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Coffee, ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Email inválido'); return; }
    setBusy(true);
    const res = await requestPasswordReset(email.trim());
    setBusy(false);
    // Nunca revela se o email existe ou não — evita confirmar a um atacante
    // que endereço tem conta, mesmo que resetPasswordForEmail falhe.
    if (!res.ok) { setError(res.error || 'Não foi possível enviar o email. Tente novamente.'); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            {sent ? <MailCheck className="w-7 h-7 text-primary" /> : <Coffee className="w-7 h-7 text-primary" />}
          </div>
          <h1 className="font-heading text-xl font-bold">Recuperar password</h1>
          {!sent && (
            <p className="text-xs text-muted-foreground">
              Indique o email da sua conta — enviamos um link para repor a password.
            </p>
          )}
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Se existir uma conta com o email <strong className="text-foreground">{email.trim()}</strong>, vai receber um link para repor a password em breve.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar ao login
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'A enviar…' : 'Enviar link de recuperação'}
            </Button>
            <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
