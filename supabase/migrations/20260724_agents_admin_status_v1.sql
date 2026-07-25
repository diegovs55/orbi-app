-- Añade campo administrativo a agents.
-- No modifica agents.status, agents_status_check, ni ningún campo operativo.
-- Todos los registros existentes quedan como 'activo' (DEFAULT).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS admin_status TEXT NOT NULL DEFAULT 'activo'
    CHECK (admin_status IN ('activo', 'desactivado'));
