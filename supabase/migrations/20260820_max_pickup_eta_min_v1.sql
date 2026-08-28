-- =============================================================================
-- Migración: ORBIT-ROAD-ELIGIBILITY-02 — max_pickup_eta_min
-- Scope:     zumpahuacan
-- Aprobado:  Diego Villagrán, 2026-08-20
-- Razón:     Límite de ETA vial para disponibilidad pública en /agentes.
--            Un agente solo aparece como disponible para un queryPoint si su
--            recorrido vial estimado (OSRM) es <= 30 minutos.
--
-- Alcance EXCLUSIVO: /api/orbits/availability y experiencia /agentes.
-- NO afecta: dispatch, missions/create, missions/accept, pricing,
--            radios de asignación, ni ninguna otra lógica de misiones.
--
-- Restricciones:
--   - Append-only. No modifica filas existentes.
--   - El INSERT en motor_params_history es el registro auditable del cambio.
-- =============================================================================

BEGIN;

INSERT INTO motor_params (scope, key, value)
VALUES ('zumpahuacan', 'max_pickup_eta_min', 30);

INSERT INTO motor_params_history (scope, key, old_value, new_value, changed_by, reason)
VALUES (
  'zumpahuacan',
  'max_pickup_eta_min',
  NULL,
  30,
  NULL,
  'ORBIT-ROAD-ELIGIBILITY-02 — límite ETA vial para disponibilidad pública en /agentes. No afecta dispatch ni pricing.'
);

COMMIT;
