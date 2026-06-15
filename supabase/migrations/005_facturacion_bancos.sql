-- 5. Agregar datos de transferencia bancaria a configuracion_empresa
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS banco TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS cbu TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS alias TEXT;
ALTER TABLE configuracion_empresa ADD COLUMN IF NOT EXISTS titular TEXT;
