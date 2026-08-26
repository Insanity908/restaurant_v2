-- A.7 (spec-push-notificacoes-permissoes.md): gatilhos de eventos → push.
-- Liga os 2 gatilhos de maior valor imediato (novo pedido / pedido pronto);
-- os restantes (estoque abaixo do mínimo, comprovativo pendente, licença a
-- expirar) ficam documentados na spec para uma fase 2.
--
-- PASSO MANUAL OBRIGATÓRIO depois de aplicar esta migração (mesmo padrão
-- de archive_cron_secret em 20260825201600_archive_cron_schedule.sql — o
-- valor nunca fica neste ficheiro nem no histórico do git, só no Vault e
-- na env da função):
--
--   No SQL Editor do painel Supabase, gerar e guardar o secret UMA vez
--   (o valor tem de ser EXACTAMENTE o mesmo já definido via
--   `supabase secrets set PUSH_TRIGGER_SECRET=...`):
--     select vault.create_secret('<o mesmo valor>', 'push_trigger_secret');
--
-- Sem isto, os gatilhos disparam mas `send-push` rejeita o pedido
-- (x-push-trigger-secret não bate certo) — falha em segurança (não envia
-- nada), nunca em enviar sem autenticação. Como net.http_post é
-- assíncrono (fire-and-forget), uma falha aqui nunca bloqueia nem reverte
-- a criação/actualização do pedido em si.

-- Espelha DEFAULT_PERMISSIONS (src/lib/permissions.ts) + overrides de
-- staff_permissions — mesma lógica de hasPermission()/getStaffPermissions()
-- do cliente, mas em SQL. admin/superadmin sempre incluídos (bypass, tal
-- como no cliente). Duplica os defaults por design (ver spec A.7) — se
-- DEFAULT_PERMISSIONS mudar no cliente, esta função tem de ser actualizada
-- à mão.
create or replace function public.staff_with_permission(_tenant_id uuid, _permission text)
returns table (staff_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select tm.user_id
  from public.tenant_members tm
  join public.user_roles ur on ur.tenant_id = tm.tenant_id and ur.user_id = tm.user_id
  where tm.tenant_id = _tenant_id
    and (
      ur.role in ('admin', 'superadmin')
      or coalesce(
        (
          select _permission = any(sp.permissions)
          from public.staff_permissions sp
          where sp.tenant_id = tm.tenant_id and sp.staff_id = tm.user_id
        ),
        _permission = any(
          case ur.role
            when 'manager' then array[
              'menu.view','menu.edit','inventory.view','inventory.edit',
              'pos.use','pos.discount','orders.cancel','reports.view',
              'staff.view','staff.manage','customers.view','customers.edit',
              'shifts.view','shifts.manage','tables.view','tables.manage',
              'kitchen.view','kitchen.manage','kitchen.serve','loyalty.manage',
              'proforma.print'
            ]
            when 'cashier' then array[
              'menu.view','pos.use','pos.discount','orders.cancel',
              'customers.view','customers.edit','tables.view','shifts.view',
              'kitchen.serve'
            ]
            when 'waiter' then array[
              'menu.view','pos.use','customers.view','customers.edit',
              'tables.view','kitchen.view','shifts.view','kitchen.serve'
            ]
            when 'kitchen' then array['menu.view','kitchen.view','kitchen.manage','shifts.view']
            else array[]::text[]
          end
        )
      )
    );
$$;
revoke execute on function public.staff_with_permission(uuid, text) from public, anon, authenticated;

create or replace function public.notify_push_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_ids uuid[];
  v_body text;
begin
  select array_agg(staff_id) into v_staff_ids from public.staff_with_permission(new.tenant_id, 'kitchen.view');
  if v_staff_ids is null or array_length(v_staff_ids, 1) = 0 then
    return new;
  end if;

  v_body := case new.type
    when 'dine-in' then 'Mesa ' || coalesce(new.table_number::text, '?')
    when 'takeaway' then 'Para levar'
    when 'delivery' then 'Entrega'
    else 'Novo pedido'
  end;

  perform net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-trigger-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'tenantId', new.tenant_id,
      'staffIds', to_jsonb(v_staff_ids),
      'title', 'Novo pedido',
      'body', v_body,
      'url', '/kitchen',
      'tag', 'order-' || new.id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_push_new_order on public.orders;
create trigger trg_notify_push_new_order
after insert on public.orders
for each row execute function public.notify_push_new_order();

create or replace function public.notify_push_order_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_ids uuid[];
  v_body text;
begin
  if new.status <> 'ready' or old.status = 'ready' then
    return new;
  end if;

  select array_agg(staff_id) into v_staff_ids from public.staff_with_permission(new.tenant_id, 'tables.view');
  if v_staff_ids is null or array_length(v_staff_ids, 1) = 0 then
    return new;
  end if;

  v_body := case new.type
    when 'dine-in' then 'Mesa ' || coalesce(new.table_number::text, '?')
    when 'takeaway' then 'Para levar'
    when 'delivery' then 'Entrega'
    else 'Pedido pronto'
  end;

  perform net.http_post(
    url := 'https://bbpfoygfxqwjqsolisqw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-trigger-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'tenantId', new.tenant_id,
      'staffIds', to_jsonb(v_staff_ids),
      'title', 'Pedido pronto',
      'body', v_body,
      'url', '/pos',
      'tag', 'order-' || new.id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_push_order_ready on public.orders;
create trigger trg_notify_push_order_ready
after update on public.orders
for each row execute function public.notify_push_order_ready();
