import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/context/AuthContext';

const ALWAYS_ALLOWED = ['/billing', '/billing/success', '/pricing', '/blocked', '/admin'];

export default function RequireLicense({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { isBlocked } = useLicense();

  if (user?.role === 'superadmin') return <>{children}</>;
  if (ALWAYS_ALLOWED.some(p => location.pathname.startsWith(p))) return <>{children}</>;
  if (isBlocked) return <Navigate to="/blocked" replace />;
  return <>{children}</>;
}
