import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

const ALWAYS_ALLOWED = ['/billing', '/billing/success', '/pricing', '/blocked', '/admin'];
const WARNING_THRESHOLDS = [3, 1];

export default function RequireLicense({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { tenant, status, daysLeft, isBlocked } = useLicense();

  // Avisa o dono do restaurante quando a subscrição está prestes a expirar
  // (3 dias e 1 dia antes) — só o admin (não a restante equipa) e só uma vez
  // por limiar, para não repetir o toast a cada navegação/poll do mesmo dia.
  useEffect(() => {
    if (user?.role !== 'admin' || !tenant || status !== 'active') return;
    if (!WARNING_THRESHOLDS.includes(daysLeft)) return;
    const key = `expiry_warning_${tenant.id}_${daysLeft}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    toast.warning(
      daysLeft === 1 ? 'A sua subscrição expira amanhã!' : `A sua subscrição expira em ${daysLeft} dias`,
      { description: 'Renove agora em Faturação para evitar interrupções no acesso.', duration: 10000 },
    );
  }, [user?.role, tenant, status, daysLeft]);

  if (user?.role === 'superadmin') return <>{children}</>;
  if (ALWAYS_ALLOWED.some(p => location.pathname.startsWith(p))) return <>{children}</>;
  if (isBlocked) return <Navigate to="/blocked" replace />;
  return <>{children}</>;
}
