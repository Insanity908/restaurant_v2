/**
 * Feedback de utilizadores de qualquer tenant directo ao superadmin da
 * plataforma (tabela `feedback_submissions`). Qualquer papel pode enviar —
 * não é uma ferramenta de admin — só o superadmin lê/revê.
 */
import { supabase } from '@/integrations/supabase/client';

export interface FeedbackSubmission {
  id: string;
  tenantId: string;
  tenantName?: string;
  name: string;
  role: string;
  message: string;
  status: 'unread' | 'read';
  createdAt: string;
}

type Row = {
  id: string;
  tenant_id: string;
  name: string;
  role: string;
  message: string;
  status: string;
  created_at: string;
  tenants?: { name: string } | null;
};

function mapRow(r: Row): FeedbackSubmission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenants?.name,
    name: r.name,
    role: r.role,
    message: r.message,
    status: r.status as FeedbackSubmission['status'],
    createdAt: r.created_at,
  };
}

/** Any tenant member sends feedback for their own (current) tenant. */
export async function submitFeedback(tenantId: string, name: string, role: string, message: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('feedback_submissions').insert({
    tenant_id: tenantId,
    submitted_by: auth.user?.id,
    name: name.trim(),
    role,
    message: message.trim(),
  });
  if (error) { console.warn('submitFeedback failed', error.message); return false; }
  return true;
}

/** Super Admin: every feedback submission, most recent first. */
export async function fetchFeedback(): Promise<FeedbackSubmission[]> {
  const { data, error } = await supabase
    .from('feedback_submissions')
    .select('id, tenant_id, name, role, message, status, created_at, tenants(name)')
    .order('created_at', { ascending: false });
  if (error) { console.warn('fetchFeedback failed', error.message); return []; }
  return (data as unknown as Row[]).map(mapRow);
}

/** Super Admin marks a submission as read (or back to unread). */
export async function markFeedbackStatus(id: string, status: 'unread' | 'read'): Promise<boolean> {
  const { error } = await supabase.from('feedback_submissions').update({ status }).eq('id', id);
  if (error) { console.warn('markFeedbackStatus failed', error.message); return false; }
  return true;
}

/** Super Admin deletes a submission já revista. */
export async function deleteFeedback(id: string): Promise<boolean> {
  const { error } = await supabase.from('feedback_submissions').delete().eq('id', id);
  if (error) { console.warn('deleteFeedback failed', error.message); return false; }
  return true;
}
