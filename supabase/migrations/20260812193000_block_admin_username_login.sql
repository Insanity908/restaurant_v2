-- Administradores (papel 'admin') deixam de poder entrar com username: só
-- com o email real. Isto evita contas de dono ficarem "escondidas" atrás de
-- um username partilhável, e obriga a usar o email verificado no signup.
-- superadmin e os restantes papéis (manager/cashier/waiter/kitchen)
-- continuam a poder usar username normalmente.

CREATE OR REPLACE FUNCTION public.resolve_login_email(identifier text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN identifier ILIKE '%@%' THEN lower(trim(identifier))
    ELSE (
      SELECT p.email FROM public.profiles p
      WHERE lower(p.username) = lower(trim(identifier))
        AND NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
        )
      LIMIT 1
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
