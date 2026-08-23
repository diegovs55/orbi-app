-- ECON-03B-A: identidad estructurada de recurso — V1
-- Aprobado en ECON-03B-R3 + Security Gate.
--
-- Cambios:
--   1. CREATE TABLE agent_vehicles (con RLS habilitado)
--   2. ALTER TABLE agents ADD COLUMN active_vehicle_id
--   3. Trigger: ownership + no-archivado al activar
--   4. Trigger: impedir archivar vehículo activo
--   5. ALTER TABLE missions ADD COLUMNS selected_vehicle_*
--
-- Seguridad:
--   - agent_vehicles tiene ENABLE ROW LEVEL SECURITY sin políticas.
--   - anon/authenticated: acceso denegado (SELECT=vacío, INSERT/UPDATE/DELETE=42501).
--   - service_role: bypass RLS — acceso total (API routes + Supabase Dashboard).
--   - Sin políticas públicas — tabla backend/admin-only hasta 03B-B.
--
-- Invariantes garantizadas:
--   - active_vehicle_id debe pertenecer al agente y no estar archivado (trigger 1)
--   - No se puede archivar un vehículo mientras sea active_vehicle_id (trigger 2)
--   - selected_vehicle_id con ON DELETE RESTRICT: historial nunca pierde la referencia
--   - active_vehicle_id con ON DELETE SET NULL: agente cae a legacy si vehículo se elimina
--   - Todos los nuevos campos son nullable: cero regresiones en agentes legacy

BEGIN;

-- ── 1. Tabla de vehículos ──────────────────────────────────────────────────────

CREATE TABLE agent_vehicles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID        NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  vehicle_type  TEXT        NOT NULL
    CHECK (vehicle_type IN (
      'moto_gasolina',
      'moto_electrica',
      'auto_gasolina',
      'auto_electrico',
      'camioneta',
      'otro'
    )),
  display_label TEXT        NOT NULL,
  archived_at   TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_vehicles_agent ON agent_vehicles(agent_id);

-- RLS: tabla backend/admin-only — sin políticas para anon/authenticated.
-- service_role (API routes + Supabase Dashboard) bypasea RLS.
ALTER TABLE public.agent_vehicles ENABLE ROW LEVEL SECURITY;

-- ── 2. Vehículo activo en agents ───────────────────────────────────────────────

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS active_vehicle_id UUID
    REFERENCES agent_vehicles(id) ON DELETE SET NULL;

-- ── 3. Trigger: ownership + no-archivado al activar ───────────────────────────

CREATE OR REPLACE FUNCTION chk_vehicle_ownership_and_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM agent_vehicles
      WHERE id          = NEW.active_vehicle_id
        AND agent_id    = NEW.id
        AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'VEHICLE_CONSTRAINT_VIOLATION: vehicle % is not an active vehicle of agent %',
        NEW.active_vehicle_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chk_active_vehicle
BEFORE INSERT OR UPDATE OF active_vehicle_id ON agents
FOR EACH ROW EXECUTE FUNCTION chk_vehicle_ownership_and_status();

-- ── 4. Trigger: no archivar vehículo mientras siga activo ─────────────────────

CREATE OR REPLACE FUNCTION chk_archive_vehicle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM agents WHERE active_vehicle_id = NEW.id
    ) THEN
      RAISE EXCEPTION
        'ARCHIVE_CONSTRAINT_VIOLATION: vehicle % is still active_vehicle_id of an agent. Unset it first.',
        NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_chk_archive_vehicle
BEFORE UPDATE OF archived_at ON agent_vehicles
FOR EACH ROW EXECUTE FUNCTION chk_archive_vehicle();

-- ── 5. Snapshot de recurso en missions ────────────────────────────────────────

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS selected_vehicle_id    UUID
    REFERENCES agent_vehicles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS selected_vehicle_type  TEXT
    CHECK (selected_vehicle_type IS NULL OR selected_vehicle_type IN (
      'moto_gasolina',
      'moto_electrica',
      'auto_gasolina',
      'auto_electrico',
      'camioneta',
      'otro'
    )),
  ADD COLUMN IF NOT EXISTS selected_vehicle_label TEXT;

COMMIT;
