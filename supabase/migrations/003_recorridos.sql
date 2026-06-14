-- =============================================================
-- TABLE: recorridos (GPS track history for each cadete)
-- =============================================================
CREATE TABLE recorridos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadete_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pedido_id   UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recorridos_cadete_fecha ON recorridos(cadete_id, timestamp DESC);
CREATE INDEX idx_recorridos_pedido ON recorridos(pedido_id);

-- RLS
ALTER TABLE recorridos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recorridos_insert_self" ON recorridos
  FOR INSERT WITH CHECK (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
  );

CREATE POLICY "recorridos_select_operador" ON recorridos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

CREATE POLICY "recorridos_select_self" ON recorridos
  FOR SELECT USING (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
  );

-- Add to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE recorridos;
