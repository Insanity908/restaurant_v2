-- Secção 2/6 (docs/spec-automacao-confirmacao-pagamentos.md): sessão de
-- checkout para a renovação/activação de plano com confirmação automática
-- de pagamento por SMS. tenant_id é sempre conhecido (D8: este fluxo é
-- sempre "renovar/actualizar antes de expirar", já autenticado — nunca um
-- primeiro registo), por isso NOT NULL, ao contrário do desenho inicial da
-- spec.
--
-- `plan`+`amount` (não um token único por sessão — os QR são pré-gerados e
-- fixos por plano, Secção 1-2) é a base da correspondência automática
-- (4.3): procura-se a única sessão `pending`, com este `plan`+`amount`,
-- ainda não expirada. `access_code` só é gravado depois de `status` passar
-- a 'paid' (4.4) e é o que o cliente introduz para confirmar/entrar
-- (Secção 5) — nunca usado para a correspondência em si.
CREATE TABLE public.checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan public.billing_plan NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  access_code text,
  -- ID de transacção real da operadora, guardado para auditoria mesmo não
  -- sendo usado para corresponder (4.4) — só preenchido quando `paid`.
  transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- D3: 60 minutos de validade.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 minutes'),
  paid_at timestamptz
);

-- Só uma sessão 'pending' não expirada por vez para o mesmo plano+valor
-- garante, por construção, que a correspondência automática (4.3) nunca
-- encontra mais do que uma candidata por essa combinação — reduz (não
-- elimina, dado expires_at) a ambiguidade descrita na Secção 7 como
-- principal risco residual deste desenho.
CREATE INDEX idx_checkout_sessions_matching
  ON public.checkout_sessions (plan, amount)
  WHERE status = 'pending';

CREATE INDEX idx_checkout_sessions_tenant ON public.checkout_sessions (tenant_id);

-- access_code é único só enquanto preenchido (fica NULL até à sessão
-- passar a 'paid' — Secção 2 passo 5).
CREATE UNIQUE INDEX idx_checkout_sessions_access_code
  ON public.checkout_sessions (access_code)
  WHERE access_code IS NOT NULL;

GRANT SELECT, INSERT ON public.checkout_sessions TO authenticated;
GRANT ALL ON public.checkout_sessions TO service_role;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant (não só admin — /pricing e /billing não são
-- restritas a admin) pode iniciar e ver as próprias sessões de checkout.
-- Nunca UPDATE por authenticated: `status`, `access_code`,
-- `transaction_id` e `paid_at` só são escritos pela Edge Function
-- auto-activate-payment (service role), depois de validar a SMS — um
-- membro do tenant não pode auto-activar-se só por escrever na tabela.
CREATE POLICY "Tenant member creates own checkout session"
ON public.checkout_sessions FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant member reads own checkout sessions"
ON public.checkout_sessions FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Superadmin reads all checkout sessions"
ON public.checkout_sessions FOR SELECT TO authenticated
USING (public.is_superadmin(auth.uid()));
