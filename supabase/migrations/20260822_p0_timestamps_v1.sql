-- =============================================================================
-- Migración: P0 — Timestamps operacionales irrecuperables
-- Tabla:     public.missions
-- Aprobado:  Diego Villagrán, 2026-08-22 (ECON-03A-R1 GO)
--
-- Semántica canónica:
--   route_started_at  = agente ya recogió y presiona "Iniciar ruta".
--                       Inicio operacional de B.
--                       (route_started_at − accepted_at) =
--                         A + espera en origen + recogida — NO es duración A.
--
--   completed_at      = agente presiona "Completar misión". Fin operacional.
--                       (completed_at − route_started_at) =
--                         B + handoff/entrega — NO es duración B pura.
--
--   (completed_at − accepted_at) = tiempo operacional total observado.
--
-- Restricciones:
--   - Append-only. NULL = dato no disponible (misiones históricas). No es cero.
--   - Sin backfill. No existe fuente confiable para reconstruir estos momentos.
--   - No afecta: pricing, ledger, estados, push, dispatch, RLS, payment_status.
-- =============================================================================

BEGIN;

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS route_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ NULL;

COMMIT;
