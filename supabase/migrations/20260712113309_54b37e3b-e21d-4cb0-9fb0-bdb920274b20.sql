
-- Storage policies. Object path convention: "<tenant_id>/<filename>"

-- menu-images
CREATE POLICY "menu-images read by tenant members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'menu-images'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "menu-images write by tenant admin/manager"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND (
    public.is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR public.has_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'manager')
  )
);

CREATE POLICY "menu-images update by tenant admin/manager"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'menu-images'
  AND (
    public.is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR public.has_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'manager')
  )
);

CREATE POLICY "menu-images delete by tenant admin/manager"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'menu-images'
  AND (
    public.is_tenant_admin((storage.foldername(name))[1]::uuid)
    OR public.has_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'manager')
  )
);

-- receipt-logos
CREATE POLICY "receipt-logos read by tenant members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipt-logos'
  AND public.is_tenant_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "receipt-logos write by tenant admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'receipt-logos'
  AND public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "receipt-logos update by tenant admin"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'receipt-logos'
  AND public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "receipt-logos delete by tenant admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'receipt-logos'
  AND public.is_tenant_admin((storage.foldername(name))[1]::uuid)
);
