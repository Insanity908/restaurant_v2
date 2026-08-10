-- Cria os buckets de Storage que a app já espera (src/lib/storage.ts):
-- imagens de pratos (Menu > Novo Item) e logotipo de recibo/marca
-- (Definições > Marca). Ambos privados — o cliente sempre pede signed URLs
-- (createSignedUrl/createSignedUrls), nunca URLs públicas.
--
-- Convenção de path: `${tenant_id}/${uuid}.${ext}` (ver uploadTenantImage em
-- src/lib/storage.ts) — por isso as policies usam o 1º segmento do path como
-- tenant_id e reutilizam is_tenant_member(), já definida em
-- schema_clean_install.sql para as restantes tabelas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-images', 'menu-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('receipt-logos', 'receipt-logos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Tenant members read their bucket images"
on storage.objects for select
using (
  bucket_id in ('menu-images', 'receipt-logos')
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
);

create policy "Tenant members upload their bucket images"
on storage.objects for insert
with check (
  bucket_id in ('menu-images', 'receipt-logos')
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
);

create policy "Tenant members update their bucket images"
on storage.objects for update
using (
  bucket_id in ('menu-images', 'receipt-logos')
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id in ('menu-images', 'receipt-logos')
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
);

create policy "Tenant members delete their bucket images"
on storage.objects for delete
using (
  bucket_id in ('menu-images', 'receipt-logos')
  and public.is_tenant_member(((storage.foldername(name))[1])::uuid)
);
