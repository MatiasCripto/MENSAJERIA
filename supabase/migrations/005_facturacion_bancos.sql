-- 5. Agregar datos de transferencia bancaria a configuracion_empresa
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS banco TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS cbu TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS titular TEXT;

-- 6. Crear bucket storage para logos (si no existe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir subida de archivos a usuarios autenticados
CREATE POLICY "upload_logos_authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos');

-- Permitir lectura pública del logo
CREATE POLICY "select_logos_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'logos');
