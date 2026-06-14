-- =============================================================
-- DELIVERY MANAGEMENT APP - INITIAL SCHEMA
-- =============================================================

-- Enums
CREATE TYPE user_role AS ENUM ('operador', 'cadete');
CREATE TYPE estado_pedido AS ENUM ('pendiente', 'asignado', 'en_retiro', 'en_camino', 'entregado', 'fallido');
CREATE TYPE tipo_intento AS ENUM ('entregado', 'no_atendio', 'cerrado', 'otro');

-- =============================================================
-- TABLE: usuarios
-- =============================================================
CREATE TABLE usuarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  rol        user_role NOT NULL DEFAULT 'cadete',
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- =============================================================
-- TABLE: pedidos
-- =============================================================
CREATE TABLE pedidos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            SERIAL NOT NULL,
  palabra_clave     TEXT NOT NULL,
  estado            estado_pedido NOT NULL DEFAULT 'pendiente',
  cadete_id         UUID REFERENCES usuarios(id),
  retiro_direccion  TEXT NOT NULL,
  retiro_contacto   TEXT NOT NULL,
  retiro_telefono   TEXT NOT NULL,
  entrega_direccion TEXT NOT NULL,
  entrega_contacto  TEXT NOT NULL,
  entrega_telefono  TEXT NOT NULL,
  token_cliente     UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_cadete ON pedidos(cadete_id);
CREATE INDEX idx_pedidos_token ON pedidos(token_cliente);
CREATE INDEX idx_pedidos_created_at ON pedidos(created_at DESC);

-- =============================================================
-- TABLE: intentos_entrega
-- =============================================================
CREATE TABLE intentos_entrega (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  cadete_id        UUID REFERENCES usuarios(id),
  tipo             tipo_intento NOT NULL,
  foto_url         TEXT,
  receptor_nombre  TEXT,
  receptor_dni     TEXT,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intentos_pedido ON intentos_entrega(pedido_id);

-- =============================================================
-- TABLE: ubicaciones_cadete
-- =============================================================
CREATE TABLE ubicaciones_cadete (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cadete_id   UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  pedido_id   UUID REFERENCES pedidos(id)
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

-- usuarios
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_select_auth" ON usuarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "usuarios_insert_operador" ON usuarios
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

CREATE POLICY "usuarios_update_operador" ON usuarios
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

-- pedidos
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Operador: full access
CREATE POLICY "pedidos_all_operador" ON pedidos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

-- Cadete: read assigned orders, update them
CREATE POLICY "pedidos_select_cadete" ON pedidos
  FOR SELECT USING (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
    OR EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

CREATE POLICY "pedidos_update_cadete" ON pedidos
  FOR UPDATE USING (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
  );

-- Cliente: read by token_cliente (no auth required - handled via app-level filter)
-- We use a SECURITY DEFINER function for public access (see below)

-- intentos_entrega
ALTER TABLE intentos_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intentos_select_operador" ON intentos_entrega
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

CREATE POLICY "intentos_insert_auth" ON intentos_entrega
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- ubicaciones_cadete
ALTER TABLE ubicaciones_cadete ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ubicaciones_insert_self" ON ubicaciones_cadete
  FOR INSERT WITH CHECK (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
  );

CREATE POLICY "ubicaciones_select_operador" ON ubicaciones_cadete
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM usuarios WHERE email = auth.email() AND rol = 'operador')
  );

CREATE POLICY "ubicaciones_select_cadete" ON ubicaciones_cadete
  FOR SELECT USING (
    cadete_id IN (SELECT id FROM usuarios WHERE email = auth.email())
  );

-- =============================================================
-- SECURITY DEFINER: Public tracking data
-- =============================================================
CREATE OR REPLACE FUNCTION get_pedido_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido JSON;
  v_intentos JSON;
  v_ubicacion JSON;
BEGIN
  SELECT row_to_json(p.*) INTO v_pedido
  FROM pedidos p
  WHERE p.token_cliente = p_token;

  IF v_pedido IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT json_agg(row_to_json(i)) INTO v_intentos
  FROM intentos_entrega i
  WHERE i.pedido_id = (SELECT id FROM pedidos WHERE token_cliente = p_token)
  ORDER BY i.created_at DESC;

  IF (v_pedido->>'cadete_id') IS NOT NULL THEN
    SELECT row_to_json(u) INTO v_ubicacion
    FROM ubicaciones_cadete u
    WHERE u.cadete_id = (SELECT id FROM pedidos WHERE token_cliente = p_token)
    ORDER BY u.timestamp DESC
    LIMIT 1;
  END IF;

  RETURN json_build_object(
    'pedido', v_pedido,
    'intentos', COALESCE(v_intentos, '[]'::json),
    'ubicacion', v_ubicacion
  );
END;
$$;

-- =============================================================
-- REALTIME PUBLICATION
-- =============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE ubicaciones_cadete;
