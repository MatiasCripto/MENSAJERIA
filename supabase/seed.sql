-- =============================================================
-- SEED DATA - DELIVERY MANAGEMENT APP
-- =============================================================
-- IMPORTANTE: Ejecutar SOLO después de la migration 001.
-- Requiere que el bucket 'fotos-entrega' exista en Storage.
-- Requiere que Auth (email+password) esté habilitado.
-- =============================================================

-- =============================================================
-- 1. CREAR USUARIOS EN AUTH (via Supabase Admin API)
--    Esto NO se puede hacer desde SQL directamente.
--    Se usa SQL trigger para sincronizar auth.users con usuarios.
-- =============================================================

-- Trigger: cuando se crea un usuario en auth.users, NO lo insertamos
-- automáticamente porque necesitamos el rol. Mejor usamos la API de
-- Supabase o inserción manual desde el dashboard.

-- En su lugar, creamos una función auxiliar para crear usuarios fácilmente:

CREATE OR REPLACE FUNCTION crear_usuario(
  p_email TEXT,
  p_password TEXT,
  p_nombre TEXT,
  p_rol user_role
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Insertar directamente en usuarios (asumiendo que el usuario ya existe en auth.users)
  INSERT INTO usuarios (email, nombre, rol, activo)
  VALUES (p_email, p_nombre, p_rol, TRUE)
  ON CONFLICT (email) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    rol = EXCLUDED.rol,
    activo = TRUE
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

-- =============================================================
-- 2. USUARIOS DE PRUEBA
--    Primero crear en Auth (desde Supabase dashboard o API):
--    - operador@test.com / test123456
--    - cadete@test.com / test123456
--    LUEGO ejecutar:
-- =============================================================

-- Operador test
SELECT crear_usuario('operador@test.com', 'test123456', 'Operador Test', 'operador');

-- Cadete test
SELECT crear_usuario('cadete@test.com', 'test123456', 'Cadete Test', 'cadete');

-- =============================================================
-- 3. PEDIDO DE EJEMPLO
-- =============================================================

DO $$
DECLARE
  v_cadete_id UUID;
  v_pedido_id UUID;
BEGIN
  SELECT id INTO v_cadete_id FROM usuarios WHERE email = 'cadete@test.com';

  INSERT INTO pedidos (
    palabra_clave,
    estado,
    cadete_id,
    retiro_direccion,
    retiro_contacto,
    retiro_telefono,
    entrega_direccion,
    entrega_contacto,
    entrega_telefono,
    notas
  ) VALUES (
    'FAROL',
    'asignado',
    v_cadete_id,
    'Av. Corrientes 1234, CABA',
    'Carlos López',
    '11 5555-0101',
    'Av. Santa Fe 5678, CABA',
    'María García',
    '11 5555-0202',
    'Dejar en recepción, piso 5'
  ) RETURNING id INTO v_pedido_id;

  RAISE NOTICE 'Pedido de ejemplo creado con ID: %', v_pedido_id;
END $$;

-- =============================================================
-- 4. CONFIGURACIÓN STORAGE
--    (Ejecutar desde Supabase Dashboard > Storage)
--    Bucket: fotos-entrega
--    Policy: Public read (SELECT) para todos
--    Policy: Authenticated insert (INSERT) para cadetes
-- =============================================================

-- =============================================================
-- 5. CONFIGURACIÓN AUTH
--    (Ejecutar desde Supabase Dashboard > Authentication > Providers)
--    Habilitar: Email + Password
--    Deshabilitar: Confirm email (para testing)
-- =============================================================
