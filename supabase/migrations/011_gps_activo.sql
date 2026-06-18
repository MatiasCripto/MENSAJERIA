ALTER TABLE ubicaciones_cadete ADD COLUMN IF NOT EXISTS gps_activo BOOLEAN DEFAULT true;
ALTER TABLE ubicaciones_cadete ADD COLUMN IF NOT EXISTS ultima_actualizacion TIMESTAMPTZ DEFAULT NOW();
