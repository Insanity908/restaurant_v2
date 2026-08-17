-- Limpeza pontual: remove o pedido de teste real criado ao verificar
-- manualmente o novo fluxo de pedido pelo cliente (QR na mesa) através da
-- UI a sério (não um rollback de diagnóstico como as migrações
-- anteriores) e liberta a mesa de volta a 'free'.
delete from public.order_items where order_id = '15488c5f-0fb7-48ab-82fe-6a75ea3477a6';
delete from public.orders where id = '15488c5f-0fb7-48ab-82fe-6a75ea3477a6';
update public.restaurant_tables
set status = 'free', current_order_id = null
where id = '8978fc48-2376-451d-86aa-611701e6f591' and current_order_id = '15488c5f-0fb7-48ab-82fe-6a75ea3477a6';
