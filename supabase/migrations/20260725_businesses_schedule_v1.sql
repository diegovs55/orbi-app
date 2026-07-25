-- Fase A: horario semanal por día de la semana.
-- schedule es un JSONB con 7 claves (lunes..domingo), cada una con
-- { isOpen: boolean, opensAt: string | null, closesAt: string | null }.
-- NULL significa "no configurado": el código cae back a opening_time/closing_time.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT NULL;
