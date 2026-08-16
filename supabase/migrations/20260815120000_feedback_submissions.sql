-- Permite a QUALQUER membro de um tenant (não só admin) enviar feedback
-- directo ao superadmin da plataforma, visível na tab "Feedback" do Super
-- Admin.
CREATE TABLE public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id),
  -- Nome/papel de quem enviou, guardados como estavam no momento — não
  -- dependem de profiles/user_roles continuarem a existir mais tarde.
  name text NOT NULL,
  role text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.feedback_submissions TO authenticated;
GRANT ALL ON public.feedback_submissions TO service_role;
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant pode enviar feedback pelo seu próprio tenant.
CREATE POLICY "Tenant members submit feedback"
ON public.feedback_submissions FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(tenant_id));

-- Só o superadmin lê e revê (marca como lido).
CREATE POLICY "Superadmin reads feedback"
ON public.feedback_submissions FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmin updates feedback"
ON public.feedback_submissions FOR UPDATE TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));
