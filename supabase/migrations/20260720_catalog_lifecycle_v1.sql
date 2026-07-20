-- =============================================================================
-- Migración: Ciclo de vida de producto — estado 'descontinuado'
-- Fecha:     2026-07-20
-- Alcance:   Solo agrega un CHECK constraint a products.status.
--            No modifica datos, no toca missions, ledger, estadísticas ni
--            tablas económicas. Append-only.
--
-- Verificación previa (2026-07-20):
--   - NO existía ningún CHECK constraint previo sobre products.status.
--   - Todos los valores actuales son 'disponible' (7 filas). Ninguna
--     inconsistencia entre status y available.
--   - La migración no rechaza ninguna fila existente.
--
-- Rollback:
--   ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
-- =============================================================================

BEGIN;

ALTER TABLE products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('disponible', 'agotado', 'pausado', 'descontinuado'));

COMMENT ON COLUMN products.status IS
  'Ciclo de vida del producto.
   disponible    — visible al cliente y vendible.
   agotado       — visible al cliente, no vendible.
   pausado       — oculto al cliente, no vendible, reactivable por el negocio.
   descontinuado — oculto al cliente, no vendible, requiere confirmación para reactivar.
   Regla: available=true solo cuando status=''disponible''.
   Ningún valor borra datos históricos ni misiones existentes.';

COMMIT;
