CREATE TABLE IF NOT EXISTS pedido_cadetes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  cadete_id UUID REFERENCES usuarios(id),
  asignado_en TIMESTAMPTZ DEFAULT NOW(),
  desasignado_en TIMESTAMPTZ,
  porcentaje_asignado NUMERIC(5,2) DEFAULT 100,
  monto_asignado NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pedido_cadetes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pedido_cadetes TO authenticated;
CREATE POLICY "pedido_cadetes_all" ON pedido_cadetes
  FOR ALL TO authenticated USING (true);

-- Trigger: cuando se crea un pedido con cadete_id,
-- registrar automáticamente en pedido_cadetes
CREATE OR REPLACE FUNCTION registrar_cadete_inicial()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cadete_id IS NOT NULL THEN
    INSERT INTO pedido_cadetes (pedido_id, cadete_id, porcentaje_asignado)
    VALUES (NEW.id, NEW.cadete_id, 100);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_registrar_cadete_inicial
AFTER INSERT ON pedidos
FOR EACH ROW
EXECUTE FUNCTION registrar_cadete_inicial();
