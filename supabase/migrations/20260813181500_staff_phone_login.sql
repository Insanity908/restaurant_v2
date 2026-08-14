-- "Novo funcionário" deixa de exigir email — passa a aceitar telefone como
-- identificador alternativo de login quando não há email (username nunca
-- serviu de identificador de autenticação sozinho, é só um atalho opcional
-- independente; e deixou de ser "derivado" de um email fictício).
--
-- resolve_login_email já resolve username -> email quando existe; esta
-- função cobre o caso complementar (conta criada só com telefone, sem
-- nenhum email) devolvendo o telefone para o cliente tentar
-- signInWithPassword({ phone, password }) em vez de email/password.
CREATE OR REPLACE FUNCTION public.resolve_login_phone(identifier text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone FROM public.profiles p
  WHERE lower(p.username) = lower(trim(identifier))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_phone(text) TO anon, authenticated;
