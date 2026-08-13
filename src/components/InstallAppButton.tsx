import { useState } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { cn } from '@/lib/utils';

interface Props {
  /** 'cta' — botão grande para a landing page. 'compact' — versão discreta para a sidebar da app. */
  variant?: 'cta' | 'compact';
  className?: string;
}

/**
 * Botão "Instalar app" — dispara o prompt nativo do browser (Android/Chrome/
 * Edge/desktop) ou, no iOS Safari (que não suporta esse prompt), abre um
 * diálogo com o passo a passo manual. Não aparece se a app já estiver
 * instalada, nem em browsers que não ofereçam nenhuma das duas vias.
 */
export default function InstallAppButton({ variant = 'cta', className }: Props) {
  const { canPromptInstall, isIOS, isInstalled, promptInstall } = useInstallPrompt();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  if (isInstalled || (!canPromptInstall && !isIOS)) return null;

  const label = variant === 'cta' ? 'Instalar no telemóvel' : 'Instalar app';

  return (
    <>
      <Button
        variant={variant === 'cta' ? 'outline' : 'ghost'}
        size={variant === 'cta' ? 'lg' : 'sm'}
        onClick={() => (canPromptInstall ? promptInstall() : setShowIOSInstructions(true))}
        className={cn(
          variant === 'compact' && 'w-full justify-center lg:justify-start gap-2 text-muted-foreground',
          className,
        )}
      >
        <Download className={variant === 'cta' ? 'w-4 h-4' : 'w-4 h-4 shrink-0'} />
        <span className={variant === 'compact' ? 'hidden lg:inline' : undefined}>{label}</span>
      </Button>

      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar no iPhone/iPad</DialogTitle>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
              <span className="flex items-center gap-1.5">
                Toca no ícone de partilha <Share className="w-4 h-4 inline text-muted-foreground" /> na barra do Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
              <span className="flex items-center gap-1.5">
                Escolhe <SquarePlus className="w-4 h-4 inline text-muted-foreground" /> "Adicionar ao ecrã principal".
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
              <span>Confirma em "Adicionar" — o ícone da app fica no ecrã principal.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
