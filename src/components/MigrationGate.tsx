import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useOptionalAuth } from '@/context/AuthContext';
import { hasLegacyData, runLegacyImport } from '@/lib/legacyImport';
import { fetchTenantCatalog } from '@/lib/store';
import { Button } from '@/components/ui/button';

type Phase = 'idle' | 'running' | 'done' | 'error';

/**
 * On the first login after the cloud migration, pushes any legacy data left on
 * this device to the backend while showing a blocking "A migrar dados…" screen.
 */
export default function MigrationGate({ children }: { children?: React.ReactNode }) {
  const auth = useOptionalAuth();
  const tenantId = auth?.user?.tenantId;
  const [phase, setPhase] = useState<Phase>('idle');
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId || started.current === tenantId) return;
    if (!hasLegacyData(tenantId)) return;
    started.current = tenantId;
    setPhase('running');
    (async () => {
      const res = await runLegacyImport(tenantId);
      if (!res.ok) { setError(res.error ?? 'Erro desconhecido'); setPhase('error'); return; }
      setSummary(res.imported ?? {});
      await fetchTenantCatalog(tenantId).catch(() => {});
      setPhase('done');
    })();
  }, [tenantId]);

  if (phase === 'idle') return <>{children ?? null}</>;

  const labels: Record<string, string> = {
    menuItems: 'Pratos', tables: 'Mesas', inventory: 'Inventário',
    customers: 'Clientes', staff: 'Equipa',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        {phase === 'running' && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <h1 className="text-lg font-semibold">A migrar dados…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Estamos a enviar os dados guardados neste dispositivo para a nuvem. Não feche a aplicação.
            </p>
          </>
        )}

        {phase === 'done' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
            <h1 className="text-lg font-semibold">Migração concluída</h1>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => (
                <li key={k}>{labels[k] ?? k}: {n}</li>
              ))}
              {Object.values(summary).every(n => !n) && <li>Nada novo para importar.</li>}
            </ul>
            <Button className="mt-5 w-full" onClick={() => setPhase('idle')}>Continuar</Button>
          </>
        )}

        {phase === 'error' && (
          <>
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
            <h1 className="text-lg font-semibold">Falha na migração</h1>
            <p className="mt-2 break-words text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-5 w-full" onClick={() => setPhase('idle')}>Continuar mesmo assim</Button>
          </>
        )}
      </div>
    </div>
  );
}
