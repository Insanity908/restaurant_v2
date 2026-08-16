-- Biblioteca global de imagens padrão, gerida pelo superadmin, para os
-- utilizadores escolherem no Menu e no Inventário em vez de terem de
-- carregar uma foto própria. Substitui os presets estáticos embutidos no
-- código (src/assets/menu-presets) por algo que o superadmin gere sem
-- precisar de tocar em código.
CREATE TABLE public.preset_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_images TO authenticated;
GRANT ALL ON public.preset_images TO service_role;
ALTER TABLE public.preset_images ENABLE ROW LEVEL SECURITY;

-- Qualquer membro autenticado (de qualquer tenant) pode ler a biblioteca.
CREATE POLICY "Anyone reads preset images"
ON public.preset_images FOR SELECT TO authenticated
USING (true);

-- Só o superadmin gere (upload/edição/remoção) a biblioteca.
CREATE POLICY "Superadmin inserts preset images"
ON public.preset_images FOR INSERT TO authenticated
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmin updates preset images"
ON public.preset_images FOR UPDATE TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmin deletes preset images"
ON public.preset_images FOR DELETE TO authenticated
USING (public.is_superadmin(auth.uid()));

-- Bucket privado (leitura por URL assinada, como menu-images/receipt-logos)
-- — não tem prefixo de tenant_id porque a biblioteca é global.
INSERT INTO storage.buckets (id, name, public)
VALUES ('preset-images', 'preset-images', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "preset-images read by anyone"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'preset-images');

CREATE POLICY "preset-images write by superadmin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'preset-images' AND public.is_superadmin(auth.uid()));

CREATE POLICY "preset-images update by superadmin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'preset-images' AND public.is_superadmin(auth.uid()));

CREATE POLICY "preset-images delete by superadmin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'preset-images' AND public.is_superadmin(auth.uid()));
