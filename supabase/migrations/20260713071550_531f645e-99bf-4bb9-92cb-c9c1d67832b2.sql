
-- Extend handle_new_user to auto-grant superadmin role for the platform owner email.
-- Also allows normal signups to proceed as tenant admins (bootstrap-tenant edge function handles that).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-promote the platform owner to superadmin on first signup.
  IF lower(NEW.email) = 'admin@saborposystem.mz' THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (NEW.id, NULL, 'superadmin'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
