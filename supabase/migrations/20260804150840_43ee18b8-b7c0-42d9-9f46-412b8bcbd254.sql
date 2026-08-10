DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = 'admin@saborposystem.mz' LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_user_id, NULL, 'superadmin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;