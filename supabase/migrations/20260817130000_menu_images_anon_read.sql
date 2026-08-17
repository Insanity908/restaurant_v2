-- A página pública de pedido (QR/entrega) lê o cardápio como `anon`
-- (migração 20260817090000), mas as fotos dos pratos carregadas pelo
-- restaurante vivem no bucket privado 'menu-images', só legível por
-- `authenticated` — sem esta policy, o cliente via o emoji placeholder em
-- vez da foto real (confirmado a testar: "Object not found" ao pedir URL
-- assinado como anon). Mesmo raciocínio da policy em menu_items: fotos de
-- cardápio não são sensíveis.
create policy "menu-images read by anyone"
on storage.objects for select to anon
using (bucket_id = 'menu-images');
