import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuth();
  const [form, setForm] = useState({
    restaurant: '', name: '', email: '', phone: '', password: '', confirm: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.restaurant.trim() || !form.name.trim()) return toast.error('Nome obrigatório');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Email inválido');
    if (form.password.length < 8) return toast.error('Password deve ter pelo menos 8 caracteres');
    if (form.password !== form.confirm) return toast.error('Passwords não coincidem');
    setLoading(true);
    const res = await signUp({
      email: form.email,
      password: form.password,
      name: form.name,
      phone: form.phone || undefined,
      restaurantName: form.restaurant,
    });
    setLoading(false);
    if (!res.ok) return toast.error(res.error || 'Erro ao registar');
    toast.success(`Bem-vindo, ${form.name}! Tem 7 dias grátis.`);
    navigate('/onboarding', { replace: true });
  };

  const google = async () => {
    setLoading(true);
    const res = await signInWithGoogle();
    setLoading(false);
    if (!res.ok) toast.error(res.error || 'Erro no Google Sign-in');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            <Coffee className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">Criar conta de Administrador</h1>
          <p className="text-xs text-muted-foreground">7 dias grátis. Sem cartão.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do restaurante</Label>
            <Input value={form.restaurant} onChange={e => setForm(f => ({ ...f, restaurant: e.target.value }))} placeholder="Sabor de Nampula" />
          </div>
          <div className="space-y-1.5">
            <Label>O seu nome</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar password</Label>
            <Input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'A criar...' : 'Criar conta'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/60" /></div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={google} disabled={loading}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.5l2.63-2.53C16.9 3.34 14.68 2.4 12 2.4 6.98 2.4 2.9 6.48 2.9 11.5s4.08 9.1 9.1 9.1c5.25 0 8.72-3.68 8.72-8.86 0-.6-.07-1.06-.16-1.54H12z"/>
          </svg>
          Continuar com Google
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
