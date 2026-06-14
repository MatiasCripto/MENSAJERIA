-- =============================================================
-- Add billing / commercial fields to pedidos
-- =============================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_empresa text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS contacto_nombre text;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora_salida time;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS importe numeric(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS forma_pago text;
