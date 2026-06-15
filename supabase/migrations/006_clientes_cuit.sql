-- 7. Agregar CUIT/CUIL y Razón Social a clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuit TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razon_social TEXT;
