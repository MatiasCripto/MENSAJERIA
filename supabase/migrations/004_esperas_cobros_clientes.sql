-- ============================================================
-- Moto Express — Migración: Esperas, Cobros, Clientes, Facturación
-- ============================================================

-- 1. Agregar columnas a pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cobro_monto NUMERIC(10,2);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cobro_tipo TEXT; -- 'efectivo', 'transferencia'
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cobro_confirmado BOOLEAN DEFAULT FALSE;

-- 2. Agregar estado 'esperando_pago' al enum
ALTER TYPE estado_pedido ADD VALUE IF NOT EXISTS 'esperando_pago';

-- 3. Tabla esperas
CREATE TABLE IF NOT EXISTS esperas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id),
  cadete_id UUID REFERENCES usuarios(id),
  inicio TIMESTAMPTZ NOT NULL,
  fin TIMESTAMPTZ,
  minutos_cobrados INTEGER,
  importe_espera NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE esperas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.esperas TO authenticated;
CREATE POLICY "esperas_all" ON esperas FOR ALL TO authenticated USING (true);

-- 4. Tabla clientes
CREATE TABLE IF NOT EXISTS clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  empresa TEXT,
  telefono TEXT,
  direccion_habitual TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.clientes TO authenticated;
CREATE POLICY "clientes_all" ON clientes FOR ALL TO authenticated USING (true);

-- 5. Tabla configuracion_empresa
CREATE TABLE IF NOT EXISTS configuracion_empresa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT,
  cuit TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracion_empresa ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.configuracion_empresa TO authenticated;
CREATE POLICY "config_all" ON configuracion_empresa FOR ALL TO authenticated USING (true);

-- 6. Agregar columnas restantes a pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cobro_espera NUMERIC(10,2) DEFAULT 0;

-- 7. Agregar modalidad_pago y saldo_deuda a clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS modalidad_pago TEXT DEFAULT 'contado';
-- valores: 'contado', 'cuenta_corriente'
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_deuda NUMERIC(10,2) DEFAULT 0;

-- 8. Tabla cuenta_corriente
CREATE TABLE IF NOT EXISTS cuenta_corriente (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES clientes(id),
  pedido_id UUID REFERENCES pedidos(id) NULLABLE,
  tipo TEXT NOT NULL, -- 'cargo' (viaje) o 'pago' (cobro)
  descripcion TEXT,
  monto NUMERIC(10,2) NOT NULL,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  operador_id UUID REFERENCES usuarios(id)
);

ALTER TABLE cuenta_corriente ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cuenta_corriente TO authenticated;
CREATE POLICY "cc_all" ON cuenta_corriente FOR ALL TO authenticated USING (true);

-- 9. Función y trigger: auto-cargo a cuenta corriente cuando se crea un pedido
CREATE OR REPLACE FUNCTION auto_cargo_cuenta_corriente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM clientes
    WHERE id = NEW.cliente_id AND modalidad_pago = 'cuenta_corriente'
  ) AND NEW.importe IS NOT NULL AND NEW.importe > 0 THEN
    INSERT INTO cuenta_corriente (cliente_id, pedido_id, tipo, descripcion, monto)
    VALUES (NEW.cliente_id, NEW.id, 'cargo', 'Viaje #' || NEW.codigo, NEW.importe);
    UPDATE clientes SET saldo_deuda = COALESCE(saldo_deuda, 0) + NEW.importe
    WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_cargo_cuenta_corriente
AFTER INSERT ON pedidos
FOR EACH ROW
EXECUTE FUNCTION auto_cargo_cuenta_corriente();
