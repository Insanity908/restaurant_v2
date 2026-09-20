/**
 * Ficha de Visita e Diagnóstico JSETRA enviada a um indivíduo/restaurante
 * fora da plataforma — gerida pelo superadmin (aba "Diagnóstico"), preenchida
 * pelo destinatário sem conta a partir de um link com token (ver
 * QuestionnairePage). Caminho fino directo ao Supabase, como customerOrder.ts
 * — não é dado de tenant, não passa pelo orderStore/outbox local-first.
 */
import { supabase } from '@/integrations/supabase/client';
import type { QuestionnaireAnswers } from './diagnosticQuestionnaire';

export interface SalesQuestionnaire {
  id: string;
  token: string;
  label: string;
  status: 'pending' | 'submitted';
  answers: QuestionnaireAnswers | null;
  createdAt: string;
  submittedAt?: string;
}

function mapRow(r: {
  id: string; token: string; label: string; status: string;
  answers: unknown; created_at: string; submitted_at: string | null;
}): SalesQuestionnaire {
  return {
    id: r.id,
    token: r.token,
    label: r.label,
    status: r.status as SalesQuestionnaire['status'],
    answers: (r.answers as QuestionnaireAnswers | null) ?? null,
    createdAt: r.created_at,
    submittedAt: r.submitted_at ?? undefined,
  };
}

/** Super Admin: todos os questionários enviados, mais recente primeiro. */
export async function fetchQuestionnaires(): Promise<SalesQuestionnaire[]> {
  const { data, error } = await supabase
    .from('sales_questionnaires')
    .select('id, token, label, status, answers, created_at, submitted_at')
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchQuestionnaires failed', error.message); return []; }
  return data.map(mapRow);
}

/** Super Admin: cria um novo questionário e devolve o token para montar o link. */
export async function createQuestionnaire(label: string): Promise<SalesQuestionnaire | null> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('sales_questionnaires')
    .insert({ label: label.trim(), created_by: auth.user?.id })
    .select('id, token, label, status, answers, created_at, submitted_at')
    .single();
  if (error) { console.warn('createQuestionnaire failed', error.message); return null; }
  return mapRow(data);
}

/** Super Admin apaga um questionário (já revisto, ou enviado por engano). */
export async function deleteQuestionnaire(id: string): Promise<boolean> {
  const { error } = await supabase.from('sales_questionnaires').delete().eq('id', id);
  if (error) { console.warn('deleteQuestionnaire failed', error.message); return false; }
  return true;
}

/** Link público a enviar ao destinatário (WhatsApp, email, etc.). */
export function questionnaireLink(token: string): string {
  return `${window.location.origin}/questionario/${token}`;
}

/** Página pública: estado actual pelo token do link — não identifica o destinatário. */
export async function getQuestionnaireByToken(token: string): Promise<{ status: 'pending' | 'submitted'; answers: QuestionnaireAnswers | null } | null> {
  const { data, error } = await supabase.rpc('get_questionnaire_by_token', { p_token: token });
  if (error) { console.warn('getQuestionnaireByToken failed', error.message); return null; }
  if (!data || typeof data !== 'object' || !('status' in data)) return null;
  const d = data as { status: string; answers: unknown };
  return { status: d.status as 'pending' | 'submitted', answers: (d.answers as QuestionnaireAnswers | null) ?? null };
}

/** Página pública: submete (ou actualiza) as respostas do destinatário. */
export async function submitQuestionnaireResponse(token: string, answers: QuestionnaireAnswers): Promise<boolean> {
  const { data, error } = await supabase.rpc('submit_questionnaire_response', {
    p_token: token, p_answers: answers as never,
  });
  if (error) { console.warn('submitQuestionnaireResponse failed', error.message); return false; }
  return data === true;
}
