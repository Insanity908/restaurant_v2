import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  QUESTIONNAIRE_SECTIONS, emptyQuestionnaireAnswers, isFieldVisible,
  type QuestionnaireAnswers, type QuestionnaireField,
} from '@/lib/diagnosticQuestionnaire';
import { getQuestionnaireByToken, submitQuestionnaireResponse } from '@/lib/salesQuestionnaires';

function Chips({ field, answers, onChange }: {
  field: QuestionnaireField; answers: QuestionnaireAnswers; onChange: (key: string, value: string | string[]) => void;
}) {
  const value = answers[field.key];
  const isMulti = field.type === 'multi';
  const toggle = (option: string) => {
    if (isMulti) {
      const arr = Array.isArray(value) ? value : [];
      onChange(field.key, arr.includes(option) ? arr.filter(v => v !== option) : [...arr, option]);
    } else {
      onChange(field.key, value === option ? '' : option);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(field.options ?? []).map(option => {
        const active = isMulti ? Array.isArray(value) && value.includes(option) : value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={cn(
              'px-3.5 py-2 rounded-full text-sm font-medium border transition-colors',
              active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-primary/60',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function Field({ field, answers, onChange }: {
  field: QuestionnaireField; answers: QuestionnaireAnswers; onChange: (key: string, value: string | string[]) => void;
}) {
  if (!isFieldVisible(field, answers)) return null;
  const value = answers[field.key];
  return (
    <div className={cn('space-y-2', field.highlight && 'bg-primary/5 border border-primary/20 rounded-xl p-4')}>
      {field.prompt && <p className="font-heading text-[15px] leading-snug">"{field.prompt}"</p>}
      {field.label && <Label className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</Label>}
      {field.type === 'text' && (
        <Input value={typeof value === 'string' ? value : ''} placeholder={field.placeholder} onChange={e => onChange(field.key, e.target.value)} />
      )}
      {field.type === 'textarea' && (
        <Textarea value={typeof value === 'string' ? value : ''} placeholder={field.placeholder ?? 'Escreva aqui…'} rows={3} onChange={e => onChange(field.key, e.target.value)} />
      )}
      {(field.type === 'choice' || field.type === 'multi') && <Chips field={field} answers={answers} onChange={onChange} />}
    </div>
  );
}

export default function QuestionnairePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(emptyQuestionnaireAnswers());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    getQuestionnaireByToken(token).then(result => {
      setLoading(false);
      if (!result) { setNotFound(true); return; }
      if (result.answers) setAnswers({ ...emptyQuestionnaireAnswers(), ...result.answers });
      if (result.status === 'submitted') setSubmitted(true);
    });
  }, [token]);

  const update = (key: string, value: string | string[]) => setAnswers(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    const ok = await submitQuestionnaireResponse(token, answers);
    setSubmitting(false);
    if (!ok) { toast.error('Não foi possível enviar. Tente novamente.'); return; }
    setSubmitted(true);
    toast.success('Respostas enviadas. Obrigado!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-muted-foreground text-center max-w-sm">Este link não é válido ou já não está disponível.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="max-w-xl mx-auto p-4 space-y-6">
        <div className="pt-6 space-y-2">
          <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold">Ficha de Diagnóstico</h1>
          <p className="text-sm text-muted-foreground">
            Algumas perguntas sobre como o seu restaurante funciona hoje. Demora poucos minutos e ajuda-nos a perceber melhor as suas necessidades.
          </p>
        </div>

        {submitted && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Respostas recebidas — obrigado!</p>
              <p className="text-xs text-muted-foreground">Pode continuar a editar e enviar de novo se quiser corrigir alguma coisa.</p>
            </div>
          </div>
        )}

        {QUESTIONNAIRE_SECTIONS.map(section => (
          <div key={section.id} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary/40 flex items-center gap-2.5">
              <span className="text-xs font-mono font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">{section.num}</span>
              <h2 className="font-heading font-semibold text-[15px]">{section.title}</h2>
            </div>
            <div className="p-4 space-y-4">
              {section.fields.map(field => <Field key={field.key} field={field} answers={answers} onChange={update} />)}
            </div>
          </div>
        ))}

        <Button className="w-full h-11" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (submitted ? 'Guardar alterações' : 'Enviar respostas')}
        </Button>
      </div>
    </div>
  );
}
