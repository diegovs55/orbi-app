-- =============================================================================
-- Migración: A2.1 — Amplía radio_servicio_maximo_km de 15 a 30
-- Scope:     zumpahuacan
-- Aprobado:  Diego Villagrán, 2026-07-20
-- Razón:     Cobertura territorial piloto Zumpahuacán–Tenancingo confirmada
--            operativamente tras incidente Amador (2026-07-17).
-- Ref:       Sesión de diagnóstico 2026-07-20; diseño A2.1 congelado.
--
-- Restricciones:
--   - Esta migración es append-only; no modifica 20260716_a2_radios_v1.sql.
--   - No toca DEC-16-B, tarifas, pagos, selección de agentes ni estados.
--   - El INSERT en motor_params_history es el registro auditable del cambio.
-- =============================================================================

BEGIN;

-- 1. Actualizar el parámetro activo
UPDATE motor_params
SET    value = 30
WHERE  scope = 'zumpahuacan'
  AND  key   = 'radio_servicio_maximo_km';

-- 2. Registrar en historial (Principio IV — toda regla nueva debe ser auditable)
--    changed_by NULL es válido en migraciones automáticas según el COMMENT de la tabla.
INSERT INTO motor_params_history (scope, key, old_value, new_value, changed_by, reason)
VALUES (
  'zumpahuacan',
  'radio_servicio_maximo_km',
  15,
  30,
  NULL,
  'A2.1 — Amplía cobertura territorial piloto. Aprobado por operación 2026-07-20.'
);

COMMIT;
