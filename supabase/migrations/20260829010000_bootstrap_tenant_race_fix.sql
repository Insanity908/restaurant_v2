-- Corrige uma corrida real encontrada em produção: bootstrap-tenant fazia
-- um SELECT a tenant_members (já tem tenant?) seguido, em chamadas HTTP
-- separadas, de um INSERT em tenants+tenant_members — se 2+ pedidos
-- chegassem quase ao mesmo tempo (duplo-toque, ligação instável), todos
-- passavam a verificação antes de qualquer um confirmar o INSERT.
-- Confirmado em produção: "Kotinha's Burger" (augustoajape3@gmail.com)
-- ficou com 4 tenants duplicados, todos criados em menos de 2 segundos
-- (20/08/2026 05:31:48-05:31:50).
--
-- pg_advisory_xact_lock só serve de alguma coisa se o lock + a
-- verificação + o INSERT decisivo (tenant_members, que é o que resolve a
-- corrida) estiverem todos na MESMA transacção — por isso isto tem de ser
-- uma função SQL única chamada pela Edge Function, não passos separados
-- em JS (cada chamada PostgREST é a sua própria transacção).
create or replace function public.bootstrap_tenant_slot(
  p_user_id uuid,
  p_name text,
  p_owner_email text,
  p_owner_phone text,
  p_license_key text,
  p_additional boolean
)
returns table (out_tenant_id uuid, out_existed boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_existing_tenant_id uuid;
  v_new_tenant_id uuid;
begin
  if not p_additional then
    -- Serializa chamadas concorrentes para o MESMO utilizador — a segunda
    -- só continua depois da primeira ter commitado o INSERT abaixo, e
    -- nessa altura já vê a linha existente.
    perform pg_advisory_xact_lock(hashtext(p_user_id::text));

    select tenant_id into v_existing_tenant_id
    from public.tenant_members where user_id = p_user_id limit 1;

    if v_existing_tenant_id is not null then
      out_tenant_id := v_existing_tenant_id;
      out_existed := true;
      return next;
      return;
    end if;
  end if;

  insert into public.tenants (name, owner_email, owner_phone, license_key)
  values (p_name, p_owner_email, p_owner_phone, p_license_key)
  returning id into v_new_tenant_id;

  insert into public.tenant_members (tenant_id, user_id) values (v_new_tenant_id, p_user_id);

  out_tenant_id := v_new_tenant_id;
  out_existed := false;
  return next;
end;
$$;

revoke all on function public.bootstrap_tenant_slot(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bootstrap_tenant_slot(uuid, text, text, text, text, boolean) to service_role;
