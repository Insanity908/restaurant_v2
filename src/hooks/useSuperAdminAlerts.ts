import { useEffect, useState } from 'react';
import { useOptionalAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { fetchPendingSubmissions } from '@/lib/paymentSubmissions';
import { fetchFeedback } from '@/lib/feedback';

// Partilhado/com contagem de referências, mesmo padrão de opsSubscriptions
// em store.ts — só há hoje UM sítio a chamar useSuperAdminAlerts (a
// sidebar), mas um segundo `.channel('superadmin-alerts').on(...).subscribe()`
// simultâneo rebentaria ("cannot add postgres_changes callbacks ... after
// subscribe()", porque o supabase-js devolve o canal já existente em vez de
// criar um novo para o mesmo nome de tópico) assim que alguém adicionasse um
// segundo sítio a usar este hook — mais barato blindar já do que reaprender
// isto outra vez (ver useLicense.ts).
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
const listeners = new Set<() => void>();

function subscribeSuperAdminAlerts(onChange: () => void): () => void {
  if (!sharedChannel) {
    const notify = () => listeners.forEach(fn => fn());
    sharedChannel = supabase
      .channel('superadmin-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_submissions' }, notify)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback_submissions' }, notify)
      .subscribe();
  }
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && sharedChannel) {
      void supabase.removeChannel(sharedChannel);
      sharedChannel = null;
    }
  };
}

/**
 * Contagem de "coisas novas" para o superadmin ver — comprovativos de
 * pagamento por rever + feedback por ler — mostrada como badge no ícone
 * "Super Admin" da sidebar (ver AppSidebar.tsx). Actualizada por Realtime
 * (RLS já restringe `payment_submissions`/`feedback_submissions` a
 * `is_superadmin`, por isso um `postgres_changes` normal chega — ao
 * contrário do caso público do CustomerTrackingPage) em vez de polling.
 *
 * Só activa (query + subscrição) quando o utilizador actual É superadmin —
 * o resto da equipa nunca paga este custo.
 */
export function useSuperAdminAlerts(): number {
  const auth = useOptionalAuth();
  const isSuperAdmin = auth?.user?.role === 'superadmin';
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) { setCount(0); return; }
    let active = true;

    const load = async () => {
      const [payments, feedback] = await Promise.all([fetchPendingSubmissions(), fetchFeedback()]);
      if (active) setCount(payments.length + feedback.filter(f => f.status === 'unread').length);
    };
    void load();

    const unsubscribe = subscribeSuperAdminAlerts(() => void load());
    return () => { active = false; unsubscribe(); };
  }, [isSuperAdmin]);

  return count;
}
