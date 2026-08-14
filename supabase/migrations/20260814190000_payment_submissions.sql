-- Fila de "paguei, aqui está a referência" que um admin de tenant bloqueado
-- submete a partir de /blocked. Não desbloqueia nada sozinha: é só um aviso
-- para o superadmin ir conferir e, se for real, usar "Ativar plano" (já
-- existente) para desbloquear de facto.
CREATE TABLE public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id),
  reference text NOT NULL,
  note text,
  -- 'manual' hoje; passa a 'mpesa'/'emola'/'card' quando houver integração
  -- automática de gateway (ver PaySuite no plano) — o valor por si não muda
  -- nada no fluxo actual, é só metadata para essa fase futura.
  method text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT ON public.payment_submissions TO authenticated;
GRANT ALL ON public.payment_submissions TO service_role;
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

-- O admin do tenant só submete/lê o que é dele.
CREATE POLICY "Tenant admin submits own payment proof"
ON public.payment_submissions FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_admin(tenant_id));

CREATE POLICY "Tenant admin reads own submissions"
ON public.payment_submissions FOR SELECT TO authenticated
USING (public.is_tenant_admin(tenant_id));

-- Superadmin vê e revê tudo (confirmar/dispensar).
CREATE POLICY "Superadmin reads all submissions"
ON public.payment_submissions FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmin reviews submissions"
ON public.payment_submissions FOR UPDATE TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));
