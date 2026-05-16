import PageShell from '@/components/PageShell';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <PageShell title="Configurações" subtitle="Configurações do sistema">
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Settings className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Em Desenvolvimento</p>
        <p className="text-sm">Configurações avançadas estarão disponíveis em breve</p>
      </div>
    </PageShell>
  );
}
