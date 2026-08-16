import { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DismissibleAlertProps {
  /** Muda sempre que o conteúdo do aviso mudar (ex: lista de itens em baixo stock) — reaparece se mudar depois de fechado. */
  dismissKey: string;
  tone?: 'warning' | 'destructive';
  className?: string;
  children: React.ReactNode;
}

const TONE_CLASSES: Record<string, string> = {
  warning: 'bg-warning/10 border-warning/30',
  destructive: 'bg-destructive/10 border-destructive/30',
};

/** Aviso fechável — some ao clicar em X e só reaparece se `dismissKey` mudar (ex: novo item entrou em baixo stock). */
export default function DismissibleAlert({ dismissKey, tone = 'warning', className, children }: DismissibleAlertProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (dismissedKey === dismissKey) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative flex items-start gap-2 rounded-xl border p-3', TONE_CLASSES[tone], className)}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => setDismissedKey(dismissKey)}
        aria-label="Fechar aviso"
        className="shrink-0 p-1 -m-1 rounded-md hover:bg-foreground/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
