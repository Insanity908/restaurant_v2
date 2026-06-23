import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coffee } from 'lucide-react';
import { tenantStore } from '@/lib/tenants';
import { accountStore } from '@/lib/accounts';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

export default function SignupPage() {
  const navigate = useNavigate();
  const { loginWithPassword } = useAuth();
  const [form, setForm] = useState({
    restaurant: '', name: '', email: '', phone: '', password: '', confirm: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.restaurant.trim() || !form.name.trim()) return toast.error('Nome obrigatório');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Email inválido');
    if (form.password.length < 6) return toast.error('Password deve ter pelo menos 6 caracteres');
    if (form.password !== form.confirm) return toast.error('Passwords não coincidem');
    if (accountStore.getByEmail(form.email)) return toast.error('Email já registado');
    setLoading(true);
    try {
      const tenant = tenantStore.create({
        name: form.restaurant,
        ownerEmail: form.email,
        ownerPhone: form.phone,
      });
      await accountStore.create({
        tenantId: tenant.id,
        email: form.email,
        password: form.password,
        name: form.name,
        role: 'manager',
      });
      const res = await loginWithPassword(form.email, form.password);
      if (!res.ok) throw new Error(res.error);
      toast.success(`Bem-vindo, ${form.name}! Tem 7 dias grátis.`);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-md glass-strong rounded-2xl p-6 lg:p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center">
            <Coffee className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">Criar conta de Gerente</h1>
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
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirmar password</Label>
            <Input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'A criar...' : 'Criar conta'}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
