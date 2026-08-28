// ECON-03B-B: tipos y helpers de identidad estructurada de vehículo

export const VEHICLE_TYPES = [
  "moto_gasolina",
  "moto_electrica",
  "auto_gasolina",
  "auto_electrico",
  "camioneta",
  "otro",
] as const;

export type VehicleType = typeof VEHICLE_TYPES[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  moto_gasolina:  "Motocicleta gasolina",
  moto_electrica: "Motocicleta eléctrica",
  auto_gasolina:  "Auto gasolina",
  auto_electrico: "Auto eléctrico",
  camioneta:      "Camioneta",
  otro:           "Otro",
};

export type AgentVehicle = {
  id:            string;
  vehicle_type:  VehicleType;
  display_label: string;
  archived_at:   string | null;
  created_at:    string;
  is_active:     boolean;
};

export type AgentVehiclesResponse = {
  active_vehicle_id: string | null;
  vehicles:          AgentVehicle[];
};

export function isValidVehicleType(v: unknown): v is VehicleType {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}

export function validateDisplayLabel(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "display_label debe ser un string." };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: "display_label no puede estar vacío." };
  if (trimmed.length > 80)  return { ok: false, error: "display_label no puede superar 80 caracteres." };
  return { ok: true, value: trimmed };
}
