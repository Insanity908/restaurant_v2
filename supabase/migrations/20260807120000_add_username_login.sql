-- Adiciona login por username (além de email) e permite provisionar contas
-- reais de funcionários (username/email/password) a partir da equipa.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- Unicidade case-insensitive, ignorando valores nulos/vazios.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND username <> '';

-- Resolve um identificador de login (username OU email) para o email real,
-- para que o cliente possa continuar a autenticar via signInWithPassword
-- (que só aceita email). SECURITY DEFINER porque profiles não é legível
-- publicamente, mas aqui só devolvemos o email correspondente ao username,
-- nunca outros dados.
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
      SELECT email FROM public.profiles
      WHERE lower(username) = lower(trim(identifier))
      LIMIT 1
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
