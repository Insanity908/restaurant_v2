-- handle_new_user() promovia a superadmin qualquer conta nova cujo email
-- batesse com platform_config.superadmin_email — mas o trigger dispara em
-- QUALQUER insert em auth.users, incluindo os criados por
-- create-staff-account (que usa a service role para admins convidarem
-- funcionários normais, ex: Caixa). Se o email do superadmin alguma vez for
-- trocado, ou a conta original apagada, um convite de funcionário feito por
-- qualquer admin de restaurante nesse email herdaria superadmin completo.
--
-- Corrige limitando a auto-promoção ao bootstrap: só promove enquanto
-- NENHUM superadmin existir ainda.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_email text;
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  select value into v_owner_email from public.platform_config where key = 'superadmin_email';
  if v_owner_email is not null and lower(new.email) = lower(v_owner_email)
     and not exists (select 1 from public.user_roles where role = 'superadmin'::public.app_role) then
    insert into public.user_roles (user_id, tenant_id, role)
    values (new.id, null, 'superadmin'::public.app_role)
    on conflict do nothing;
  end if;

  return new;
end;
$$;
