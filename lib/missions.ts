export const missionStatuses = [
  "por_tomar",
  "aceptada",
  "en_mision",
  "cumplida",
  "cancelada",
  "archivada"
] as const;

export type MissionStatus = (typeof missionStatuses)[number];

export const missionStatusLabels: Record<MissionStatus, string> = {
  por_tomar: "Misión por tomar",
  aceptada: "Misión aceptada",
  en_mision: "En misión",
  cumplida: "Misión cumplida",
  cancelada: "Misión cancelada",
  archivada: "Misión archivada"
};

export type ActiveMission = {
  id: string;
  service_type: string;
  origin_text: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_text: string;
  destination_lat: number | null;
  destination_lng: number | null;
  requester_name: string;
  requester_phone: string;
  detail: string;
  business_id?: string;
  product_id?: string;
  business_lat?: number | null;
  business_lng?: number | null;
  product_name?: string;
  business_name?: string;
  product_price?: number;
  items?: Array<{
    product_id: string;
    product_name: string;
    business_id: string;
    business_name: string;
    quantity: number;
    price: number;
    subtotal: number;
  }>;
  subtotal_productos?: number;
  service_fee?: number;
  total_estimado?: number;
  total?: number;
  distance_km?: number | null;
  pricing_rule?: string;
  product_ids?: string[];
  sector?: string;
  categoria_producto?: string;
  selected_agent_id: string;
  selected_agent_name: string;
  selected_agent_zone?: string;
  selected_agent_vehicle?: string;
  selected_agent_trust?: string;
  selected_agent_lat?: number | null;
  selected_agent_lng?: number | null;
  active_agent_id?: string;
  accepted_at?: string;
  payment_status: string;
  payment_method: string;
  precio_servicio?: number;
  costo_agente?: number;
  ganancia_orbi?: number;
  rating?: number | null;
  rating_comment?: string;
  rated_agent_id?: string;
  rated_requester?: string;
  rated_at?: string;
  estimated_orbit: string;
  status: MissionStatus;
  mission_status?: MissionStatus | string;
  last_updated_at: string;
  updated_at: string;
};

type CreateMissionInput = Omit<ActiveMission, "id" | "last_updated_at" | "updated_at" | "status" | "mission_status"> & {
  status?: MissionStatus;
  mission_status?: MissionStatus | string;
};

export const missionProgressStatuses: MissionStatus[] = [
  "por_tomar",
  "aceptada",
  "en_mision",
  "cumplida"
];

export function isMissionPending(mission: ActiveMission | null) {
  return mission?.status === "por_tomar";
}

export function isMissionActive(mission: ActiveMission | null) {
  return mission?.status === "aceptada" || mission?.status === "en_mision";
}

export function isMissionClosed(mission: ActiveMission | null) {
  return mission?.status === "cumplida" || mission?.status === "cancelada" || mission?.status === "archivada";
}

export function getMissionStatusLabel(status: MissionStatus) {
  return missionStatusLabels[status];
}

export function canTransitionMission(currentStatus: MissionStatus, nextStatus: MissionStatus) {
  return (
    (currentStatus === "por_tomar" && nextStatus === "aceptada") ||
    (currentStatus === "aceptada" && nextStatus === "en_mision") ||
    (currentStatus === "en_mision" && nextStatus === "cumplida") ||
    ((currentStatus === "por_tomar" || currentStatus === "aceptada" || currentStatus === "en_mision") &&
      nextStatus === "cancelada") ||
    ((currentStatus === "cumplida" || currentStatus === "cancelada") && nextStatus === "archivada")
  );
}

const ACTIVE_MISSION_KEY = "orbi_active_mission";
const MISSION_HISTORY_KEY = "orbi_mission_history";
const MISSION_CHANGE_EVENT = "orbi-mission-change";

export function createMission(mission: CreateMissionInput) {
  const now = new Date().toISOString();
  const nextMission: ActiveMission = {
    ...mission,
    id: crypto.randomUUID(),
    status: normalizeMissionStatus(mission.status ?? mission.mission_status),
    mission_status: undefined,
    last_updated_at: now,
    updated_at: now
  };

  saveActiveMission(nextMission);
  return nextMission;
}

export function getActiveMission() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawMission = window.localStorage.getItem(ACTIVE_MISSION_KEY);
  if (!rawMission) {
    return null;
  }

  try {
    return normalizeMission(JSON.parse(rawMission)) as ActiveMission;
  } catch {
    return null;
  }
}

export function getMissionHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const missions = JSON.parse(window.localStorage.getItem(MISSION_HISTORY_KEY) ?? "[]");
    return Array.isArray(missions) ? (missions.map(normalizeMission) as ActiveMission[]) : [];
  } catch {
    return [];
  }
}

export function saveActiveMission(mission: ActiveMission) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedMission = normalizeMission(mission) as ActiveMission;
  window.localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(normalizedMission));
  if (isMissionClosed(normalizedMission)) {
    saveMissionToHistory(normalizedMission);
  }
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

export function updateActiveMission(update: Partial<ActiveMission>) {
  const currentMission = getActiveMission();
  if (!currentMission) {
    return null;
  }

  const nextStatus =
    update.status || update.mission_status
      ? normalizeMissionStatus(update.status ?? update.mission_status)
      : currentMission.status;

  if (nextStatus !== currentMission.status && !canTransitionMission(currentMission.status, nextStatus)) {
    return currentMission;
  }

  const now = new Date().toISOString();
  const nextMission: ActiveMission = {
    ...currentMission,
    ...update,
    status: nextStatus,
    mission_status: undefined,
    last_updated_at: now,
    updated_at: now
  };

  saveActiveMission(nextMission);
  return nextMission;
}

export function subscribeToMission(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(MISSION_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MISSION_CHANGE_EVENT, callback);
  };
}

function saveMissionToHistory(mission: ActiveMission) {
  const history = getMissionHistory();
  const nextHistory = [
    mission,
    ...history.filter((historyMission) => historyMission.id !== mission.id)
  ].slice(0, 100);

  window.localStorage.setItem(MISSION_HISTORY_KEY, JSON.stringify(nextHistory));
}

function normalizeMission(mission: unknown) {
  const rawMission = mission as ActiveMission & { mission_status?: string; updated_at?: string };
  const status = normalizeMissionStatus(rawMission.status ?? rawMission.mission_status);
  const updatedAt = rawMission.updated_at || rawMission.last_updated_at || new Date().toISOString();

  return {
    ...rawMission,
    status,
    mission_status: undefined,
    updated_at: updatedAt,
    last_updated_at: rawMission.last_updated_at || updatedAt
  };
}

function normalizeMissionStatus(status: unknown): MissionStatus {
  if (missionStatuses.includes(status as MissionStatus)) {
    return status as MissionStatus;
  }

  if (status === "Misión por tomar" || status === "Esperando confirmación del agente") {
    return "por_tomar";
  }

  if (status === "Misión aceptada") {
    return "aceptada";
  }

  if (status === "En misión") {
    return "en_mision";
  }

  if (status === "Misión cumplida" || status === "Finalizada") {
    return "cumplida";
  }

  if (status === "Misión cancelada" || status === "Cancelada" || status === "Cancelar misión") {
    return "cancelada";
  }

  if (status === "Misión archivada") {
    return "archivada";
  }

  return "por_tomar";
}
