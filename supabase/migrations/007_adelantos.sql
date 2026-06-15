-- 7. Tabla de adelantos (vales) por cadete
CREATE TABLE IF NOT EXISTS adelantos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadete_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  monto       NUMERIC(10,2) NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adelantos_cadete ON adelantos(cadete_id);

-- RLS
ALTER TABLE adelantos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adelantos_select_authenticated"
  ON adelantos FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "adelantos_insert_authenticated"
  ON adelantos FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "adelantos_update_authenticated"
  ON adelantos FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "adelantos_delete_authenticated"
  ON adelantos FOR DELETE TO authenticated
  USING (true);
