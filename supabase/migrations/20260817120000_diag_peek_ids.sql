-- Diagnóstico pontual, sem efeito nenhum (só SELECT + RAISE NOTICE) — usado
-- para obter um tenant_id/table_id reais e verificar manualmente o fluxo de
-- pedido pelo cliente (QR/entrega) recém-criado, sem precisar de credenciais
-- de login. Não altera schema nem dados.
do $$
declare
  r record;
begin
  for r in
    select t.id as tenant_id, t.name as tenant_name, rt.id as table_id, rt.number as table_number
    from public.restaurant_tables rt
    join public.tenants t on t.id = rt.tenant_id
    limit 3
  loop
    raise notice 'tenant=% (%) table=% number=%', r.tenant_id, r.tenant_name, r.table_id, r.table_number;
  end loop;
end $$;
