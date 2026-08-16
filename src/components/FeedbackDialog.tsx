import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { useOptionalAuth } from '@/context/AuthContext';
import { submitFeedback } from '@/lib/feedback';
import { toast } from 'sonner';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Canal directo para qualquer utilizador (não só admin) enviar feedback ao
 * superadmin da plataforma — visível na tab "Feedback" do Super Admin.
 */
export default function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const send = async () => {
    const tenantId = user.tenantId ?? localStorage.getItem('current_tenant_id');
    if (!message.trim() || !tenantId) return;
    setSending(true);
    const ok = await submitFeedback(tenantId, user.name, user.role, message.trim());
    setSending(false);
    if (!ok) { toast.error('Não foi possível enviar o feedback'); return; }
    toast.success('Feedback enviado — obrigado!');
    setMessage('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Enviar feedback</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Sugestões, problemas ou o que achar importante — vai directo para o superadmin.
        </p>
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Escreva aqui..."
          rows={5}
          maxLength={2000}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={send} disabled={!message.trim() || sending}>
            <Send className="w-4 h-4" />{sending ? 'A enviar…' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
