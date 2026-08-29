-- Bucket para os 12 QR de plano pré-gerados por Carlos na app do e-Mola
-- (Secção 1-2 da spec de pagamentos, D1). Mesmo padrão de preset-images:
-- privado, leitura por qualquer `authenticated` (mostrado no
-- AutoPaymentDialog a qualquer membro de tenant a pagar/renovar), escrita
-- só pelo superadmin.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr', 'payment-qr', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "payment-qr read by anyone authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-qr');

CREATE POLICY "payment-qr write by superadmin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-qr' AND public.is_superadmin(auth.uid()));

CREATE POLICY "payment-qr update by superadmin"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payment-qr' AND public.is_superadmin(auth.uid()));

CREATE POLICY "payment-qr delete by superadmin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payment-qr' AND public.is_superadmin(auth.uid()));
