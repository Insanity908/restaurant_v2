-- A página pública de pedido (QR/entrega) é aberta no telemóvel do PRÓPRIO
-- cliente — não há como reaproveitar app_settings em localStorage (isso é
-- por dispositivo, só existe no computador/telemóvel da equipa). Sem isto o
-- cardápio do cliente não tinha nenhuma identidade visual do restaurante
-- (nome/logo/cor de marca), só um "Cardápio" genérico. app_settings guarda
-- tudo num único jsonb `data` (incl. dados de pagamento sensíveis como
-- mpesaNumber/bankAccount), por isso não dá para abrir a tabela a `anon` —
-- expõe-se só o subconjunto seguro (marca + cores) via RPC, mesmo padrão de
-- get_order_status/verify_loyalty_customer.
create or replace function public.get_public_branding(p_tenant_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'brandName', s.data->>'brandName',
    'iconEmoji', s.data->>'iconEmoji',
    'iconUrl', s.data->>'iconUrl',
    'primaryHue', (s.data->>'primaryHue')::numeric,
    'primarySaturation', (s.data->>'primarySaturation')::numeric,
    'primaryLightness', (s.data->>'primaryLightness')::numeric,
    'backgroundHue', (s.data->>'backgroundHue')::numeric,
    'backgroundSaturation', (s.data->>'backgroundSaturation')::numeric,
    'backgroundLightness', (s.data->>'backgroundLightness')::numeric
  )
  from public.app_settings s
  where s.tenant_id = p_tenant_id;
$$;

grant execute on function public.get_public_branding(uuid) to anon, authenticated;
