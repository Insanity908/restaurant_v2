DROP POLICY IF EXISTS "Authenticated may create tenants" ON public.tenants;
CREATE POLICY "Users create tenants they own"
ON public.tenants FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR lower(owner_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

DROP POLICY IF EXISTS "Everyone reads payment accounts" ON public.system_payment_accounts;
CREATE POLICY "Admins read payment accounts"
ON public.system_payment_accounts FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  )
);