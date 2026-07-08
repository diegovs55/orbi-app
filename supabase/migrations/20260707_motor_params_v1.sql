-- ══════════════════════════════════════════════════════════════════════════
-- ORBI Motor Económico — Fase 1
-- Migración: 20260707_motor_params_v1
-- Descripción: Mueve los parámetros del motor de config.ts hardcodeado
--              a tablas en Supabase para permitir operación sin deploy.
--
-- DATOS MODIFICADOS
--   Tablas nuevas : motor_params, motor_params_history
--   Columna nueva : missions.motor_params_version (nullable, default NULL)
--   Datos existentes: NINGUNO modificado.
--   Misiones previas: motor_params_version = NULL
--     → significa "calculada con ORBI_MOTOR_1.0 hardcodeado pre-sistema"
--
-- ZERO DOWNTIME
--   ADD COLUMN nullable no requiere lock de tabla en Postgres.
--   CREATE TABLE no afecta tablas existentes.
--   La app sigue leyendo de config.ts hasta el deploy del código.
--
-- ROLLBACK (ejecutar solo si la migración falla o se revierte)
--   DROP TABLE IF EXISTS motor_params_history;
--   DROP TABLE IF EXISTS motor_params;
--   ALTER TABLE missions DROP COLUMN IF EXISTS motor_params_version;
-- ══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- DECISIÓN ARQUITECTÓNICA REGISTRADA — 2026-07-07
--
-- El motor directo (Mandado, Mensajería) es la primera fuente de verdad
-- en motor_params. El motor de catálogo (Compra local) permanece hardcodeado
-- en lib/pricing/config.ts temporalmente.
--
-- Esto es deuda técnica INTENCIONAL, no un olvido.
--
-- CONTRATO PARA LA FASE SIGUIENTE:
--   1. El motor de catálogo migrará a motor_params usando exactamente esta
--      misma tabla — no se creará una tabla paralela ni un segundo sistema.
--   2. Los tramos de distancia del catálogo (array {hastaKm, tarifa}) se
--      representarán dentro de motor_params. El mecanismo exacto se decide
--      cuando se implemente esa fase, con evidencia operativa real.
--   3. Cualquier parámetro de cualquier motor futuro usará motor_params
--      como única fuente de verdad. No hay excepciones a esta regla.
--
-- VIOLACIÓN DE ESTE CONTRATO: crear una tabla motor_catalog_params,
-- motor_params_v2, o cualquier tabla paralela para parámetros de precios.
-- ══════════════════════════════════════════════════════════════════════════

-- ── VERIFICACIÓN PRE-MIGRACIÓN (ejecutar antes, deben retornar 0 filas) ───
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'missions' AND column_name = 'motor_params_version';
-- SELECT tablename FROM pg_tables WHERE tablename IN ('motor_params','motor_params_history');
-- ──────────────────────────────────────────────────────────────────────────


-- ── 1. Tabla de parámetros activos ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS motor_params (
  id          SERIAL        PRIMARY KEY,
  scope       TEXT          NOT NULL DEFAULT 'zumpahuacan',
  key         TEXT          NOT NULL,
  value       NUMERIC       NOT NULL,
  unit        TEXT          NOT NULL,  -- 'mxn' | 'pct' | 'km' | 'multiplier'
  description TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (scope, key)
);

COMMENT ON TABLE  motor_params IS 'Parámetros activos del Motor Económico ORBI por scope geográfico.';
COMMENT ON COLUMN motor_params.scope IS 'Identificador geográfico: zumpahuacan, cdmx, etc.';
COMMENT ON COLUMN motor_params.key   IS 'Nombre del parámetro, único por scope.';
COMMENT ON COLUMN motor_params.unit  IS 'Unidad: mxn (pesos), pct (fracción 0-1), km, multiplier.';


-- ── 2. Historial append-only de cambios ───────────────────────────────────

CREATE TABLE IF NOT EXISTS motor_params_history (
  id          SERIAL        PRIMARY KEY,
  scope       TEXT          NOT NULL,
  key         TEXT          NOT NULL,
  old_value   NUMERIC,
  new_value   NUMERIC       NOT NULL,
  changed_by  UUID          REFERENCES auth.users(id),
  changed_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  reason      TEXT
);

COMMENT ON TABLE  motor_params_history IS 'Registro append-only de cada cambio de parámetro. Nunca se modifica ni se borra.';
COMMENT ON COLUMN motor_params_history.changed_by IS 'UUID del admin que autorizó el cambio. NULL solo en migraciones automáticas.';
COMMENT ON COLUMN motor_params_history.reason     IS 'Justificación del cambio. Obligatorio en producción por Principio IV.';


-- ── 3. Versión del motor en misiones ──────────────────────────────────────

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS motor_params_version INTEGER;

COMMENT ON COLUMN missions.motor_params_version IS
  'ID de motor_params_history activo al crear la misión. NULL = calculada con motor hardcodeado pre-sistema (ORBI_MOTOR_1.0).';


-- ── 4. Seed: parámetros calibrados para Zumpahuacán ──────────────────────
--
-- NOTA: Estos son los valores calibrados en la sesión económica del MVP.
--       Son distintos de los valores anteriores en config.ts:
--         config.ts actual : tarifaBase=45, costoPorKm=12
--         Calibración MVP  : tarifa_base=20, costo_por_km=6
--       El cambio de precio efectivo ocurre cuando se deploya el código
--       que lee de esta tabla. La migración SQL por sí sola no cambia nada.

INSERT INTO motor_params (scope, key, value, unit, description) VALUES
  ('zumpahuacan', 'tarifa_base',            20.00, 'mxn',        'Tarifa base de misión directa'),
  ('zumpahuacan', 'costo_por_km',            6.00, 'mxn',        'Costo adicional por kilómetro'),
  ('zumpahuacan', 'costo_por_min',           1.80, 'mxn',        'Costo adicional por minuto de duración'),
  ('zumpahuacan', 'tarifa_minima',          45.00, 'mxn',        'Precio mínimo garantizado por misión'),
  ('zumpahuacan', 'comision_agente',         0.70, 'pct',        'Fracción del service_fee para el agente (70%)'),
  ('zumpahuacan', 'radio_maximo_km',        20.00, 'km',         'Distancia máxima aceptada por el motor'),
  ('zumpahuacan', 'subsidio_maximo',        30.00, 'mxn',        'Subsidio máximo que ORBI puede absorber por misión'),
  ('zumpahuacan', 'mult_zona_urbana',        1.00, 'multiplier', 'Multiplicador zona urbana (sin recargo)'),
  ('zumpahuacan', 'mult_zona_rural',         1.25, 'multiplier', 'Multiplicador zona rural'),
  ('zumpahuacan', 'mult_zona_carretera',     1.50, 'multiplier', 'Multiplicador zona carretera'),
  ('zumpahuacan', 'mult_urgencia_normal',    1.00, 'multiplier', 'Sin recargo de urgencia'),
  ('zumpahuacan', 'mult_urgencia_alta',      1.30, 'multiplier', 'Urgencia alta'),
  ('zumpahuacan', 'mult_urgencia_critica',   1.80, 'multiplier', 'Urgencia crítica'),
  ('zumpahuacan', 'mult_nocturno',           1.30, 'multiplier', 'Recargo nocturno'),
  ('zumpahuacan', 'mult_demanda_alta',       1.25, 'multiplier', 'Recargo por demanda alta (NSI > 0.85)')
ON CONFLICT (scope, key) DO NOTHING;


-- ── VERIFICACIÓN POST-MIGRACIÓN (ejecutar después, verificar resultados) ──
--
-- 1. Columna existe y todas las misiones previas tienen NULL:
--    SELECT COUNT(*) FROM missions WHERE motor_params_version IS NOT NULL;
--    → Debe retornar 0
--
-- 2. Parámetros sembrados correctamente:
--    SELECT COUNT(*) FROM motor_params WHERE scope = 'zumpahuacan';
--    → Debe retornar 15
--
-- 3. Historial vacío (correcto, no hubo cambios manuales aún):
--    SELECT COUNT(*) FROM motor_params_history;
--    → Debe retornar 0
--
-- 4. ORBI sigue creando misiones normalmente (verificar en producción):
--    Crear una misión de prueba y confirmar que completa sin error.
--    motor_params_version debe ser NULL en esa misión hasta el deploy del código.
-- ══════════════════════════════════════════════════════════════════════════
