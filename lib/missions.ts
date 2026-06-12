import { subscribeToTableChanges } from "@/lib/supabase";

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
  customer_name?: string;
  customer_phone?: string;
  guest_name?: string;
  guest_phone?: string;
  user_id?: string;
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
  total_amount?: number;
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
  created_at?: string;
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
const ACTIVE_MISSIONS_KEY = "orbi_active_missions";
const MISSION_HISTORY_KEY = "orbi_mission_history";
const MISSION_CHANGE_EVENT = "orbi-mission-change";

// ---------------------------------------------------------------------------
// Multi-mission API (new in 2B)
// ---------------------------------------------------------------------------

export function getActiveMissions(): ActiveMission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVE_MISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.map(normalizeMission) as ActiveMission[]) : [];
  } catch {
    return [];
  }
}

export function getActiveMissionById(id: string): ActiveMission | null {
  return getActiveMissions().find((m) => m.id === id) ?? null;
}

export function addActiveMission(mission: ActiveMission): void {
  if (typeof window === "undefined") return;
  const current = getActiveMissions();
  const next = [mission, ...current.filter((m) => m.id !== mission.id)];
  window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(next));
  // Keep legacy key in sync (most recent non-closed mission) as a temporary backup.
  const primary = next.find((m) => !isMissionClosed(m));
  if (primary) {
    window.localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(primary));
  }
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

export function updateActiveMissionById(
  id: string,
  update: Partial<ActiveMission>
): ActiveMission | null {
  if (typeof window === "undefined") return null;
  const current = getActiveMissions();
  const index = current.findIndex((m) => m.id === id);
  if (index === -1) return null;

  const existing = current[index];
  const nextStatus =
    update.status || update.mission_status
      ? normalizeMissionStatus(update.status ?? update.mission_status)
      : existing.status;

  if (nextStatus !== existing.status && !canTransitionMission(existing.status, nextStatus)) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextMission: ActiveMission = {
    ...existing,
    ...update,
    status: nextStatus,
    mission_status: undefined,
    last_updated_at: now,
    updated_at: now
  };

  const next = [...current];
  next[index] = nextMission;

  if (isMissionClosed(nextMission)) {
    // Move to history and remove from active array.
    saveMissionToHistory(nextMission);
    window.localStorage.setItem(
      ACTIVE_MISSIONS_KEY,
      JSON.stringify(next.filter((m) => m.id !== id))
    );
  } else {
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(next));
  }

  // Keep legacy key in sync.
  const primary = getActiveMissions().find((m) => !isMissionClosed(m));
  if (primary) {
    window.localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(primary));
  }

  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
  return nextMission;
}

export function removeActiveMission(id: string): void {
  if (typeof window === "undefined") return;
  const next = getActiveMissions().filter((m) => m.id !== id);
  window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

// Run once on app boot to move a legacy single-mission entry into the array.
// Intentionally does NOT delete orbi_active_mission (kept as backup).
export function migrateActiveMission(): void {
  if (typeof window === "undefined") return;
  const hasArray = window.localStorage.getItem(ACTIVE_MISSIONS_KEY) !== null;
  if (hasArray) return; // already migrated
  const raw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
  if (!raw) {
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify([]));
    return;
  }
  try {
    const mission = normalizeMission(JSON.parse(raw)) as ActiveMission;
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify([mission]));
  } catch {
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify([]));
  }
}

// ---------------------------------------------------------------------------
// Legacy single-mission API — kept as shims for backward compatibility
// ---------------------------------------------------------------------------

export function createMission(mission: CreateMissionInput) {
  const now = new Date().toISOString();
  const nextMission: ActiveMission = {
    ...mission,
    id: crypto.randomUUID(),
    status: normalizeMissionStatus(mission.status ?? mission.mission_status),
    mission_status: undefined,
    customer_name: mission.customer_name || mission.requester_name,
    customer_phone: mission.customer_phone || mission.requester_phone,
    guest_name: mission.guest_name || mission.requester_name,
    guest_phone: mission.guest_phone || mission.requester_phone,
    total_amount: mission.total_amount ?? mission.total ?? mission.precio_servicio ?? 0,
    created_at: mission.created_at || now,
    last_updated_at: now,
    updated_at: now
  };

  addActiveMission(nextMission);
  return nextMission;
}

// Returns the most-relevant single active mission (highest-priority status).
export function getActiveMission(): ActiveMission | null {
  if (typeof window === "undefined") return null;

  const missions = getActiveMissions();
  if (missions.length === 0) {
    // Fallback: try legacy key (safety net during migration window).
    try {
      const raw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
      return raw ? (normalizeMission(JSON.parse(raw)) as ActiveMission) : null;
    } catch {
      return null;
    }
  }

  // Priority: en_mision > aceptada > por_tomar (with agent) > por_tomar (without)
  const priority: Record<string, number> = {
    en_mision: 0,
    aceptada: 1,
    por_tomar: 2
  };
  const active = missions.filter((m) => !isMissionClosed(m));
  if (active.length === 0) return null;

  return active.sort((a, b) => {
    const pa = priority[a.status] ?? 3;
    const pb = priority[b.status] ?? 3;
    if (pa !== pb) return pa - pb;
    // Within same status: missions with agent assigned first.
    const aa = a.selected_agent_id ? 0 : 1;
    const ab = b.selected_agent_id ? 0 : 1;
    return aa - ab;
  })[0];
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
  // Shim: delegate to the multi-mission store.
  addActiveMission(mission);
}

export function updateActiveMission(update: Partial<ActiveMission>) {
  const currentMission = getActiveMission();
  if (!currentMission) return null;
  return updateActiveMissionById(currentMission.id, update);
}

export function subscribeToMission(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(MISSION_CHANGE_EVENT, callback);

  const unsubscribeRealtime = subscribeToTableChanges("missions", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(MISSION_CHANGE_EVENT, callback);
    unsubscribeRealtime();
  };
}

export function associateMissionsToUserByPhone(phone: string, userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const activeMission = getActiveMission();
  if (activeMission && normalizePhone(activeMission.requester_phone) === normalizedPhone) {
    saveActiveMission({
      ...activeMission,
      user_id: userId,
      updated_at: new Date().toISOString()
    });
  }

  const history = getMissionHistory();
  const nextHistory = history.map((mission) =>
    normalizePhone(mission.requester_phone) === normalizedPhone
      ? { ...mission, user_id: userId, updated_at: new Date().toISOString() }
      : mission
  );
  window.localStorage.setItem(MISSION_HISTORY_KEY, JSON.stringify(nextHistory));
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
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
    customer_name: rawMission.customer_name || rawMission.requester_name,
    customer_phone: rawMission.customer_phone || rawMission.requester_phone,
    guest_name: rawMission.guest_name || rawMission.requester_name,
    guest_phone: rawMission.guest_phone || rawMission.requester_phone,
    total_amount: rawMission.total_amount ?? rawMission.total ?? rawMission.precio_servicio ?? 0,
    created_at: rawMission.created_at || updatedAt,
    updated_at: updatedAt,
    last_updated_at: rawMission.last_updated_at || updatedAt
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
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
