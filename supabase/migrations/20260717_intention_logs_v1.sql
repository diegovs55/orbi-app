-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoría de Interpretación de Intención — v1
-- Tabla de solo escritura/lectura. Sin lógica de negocio. Sin IA.
-- Registra: texto original → intención ORBI → corrección humana → resultado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intention_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),

  -- Texto libre que escribió el usuario
  texto_original       text NOT NULL,

  -- Interpretación del motor actual (detectIntention)
  intencion_orbi       text NOT NULL,
  propuesta_mostrada   text NOT NULL,

  -- Cuántos resultados de catálogo se encontraron al mismo tiempo
  -- 0 = sin ambigüedad catálogo; N > 0 = podría haber sido una compra
  resultados_catalogo  int  NOT NULL DEFAULT 0,

  -- Corrección humana (null = el usuario aceptó la interpretación de ORBI)
  correccion_humana    text,

  -- Resultado final (null = usuario abandonó el wizard)
  resultado_final      text,
  mission_id           uuid REFERENCES missions(id) ON DELETE SET NULL,

  scope                text NOT NULL DEFAULT 'zumpahuacan'
);

-- Índice para análisis por scope y fecha
CREATE INDEX IF NOT EXISTS intention_logs_scope_created
  ON intention_logs (scope, created_at DESC);

-- Índice para joins con missions
CREATE INDEX IF NOT EXISTS intention_logs_mission_id
  ON intention_logs (mission_id)
  WHERE mission_id IS NOT NULL;

-- RLS: solo escritura anónima (cliente sin sesión puede crear logs)
ALTER TABLE intention_logs ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede insertar (el cliente aún no está autenticado al buscar)
CREATE POLICY "intention_logs_insert_public"
  ON intention_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Solo service_role puede leer (admin y API server)
CREATE POLICY "intention_logs_select_service"
  ON intention_logs FOR SELECT
  TO service_role
  USING (true);

-- Solo service_role puede actualizar (PATCH desde el servidor)
CREATE POLICY "intention_logs_update_service"
  ON intention_logs FOR UPDATE
  TO service_role
  USING (true);

-- ─── Verificación ────────────────────────────────────────────────────────────
-- V-1: tabla existe con 9 columnas
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'intention_logs'
--   ORDER BY ordinal_position;
--
-- V-2: RLS activo
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'intention_logs';
--
-- V-3: insert anónimo funciona
-- INSERT INTO intention_logs (texto_original, intencion_orbi, propuesta_mostrada)
--   VALUES ('test', 'Mandado', 'Entendí. Mandamos a alguien.')
--   RETURNING id;
-- ─────────────────────────────────────────────────────────────────────────────
