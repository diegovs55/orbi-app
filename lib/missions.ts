export const missionStatuses = [
  "Misión por tomar",
  "Misión aceptada",
  "En misión",
  "Misión cumplida",
  "Misión cancelada"
] as const;

export type MissionStatus = (typeof missionStatuses)[number];

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
  estimated_orbit: string;
  mission_status: MissionStatus;
  last_updated_at: string;
};

export const missionProgressStatuses: MissionStatus[] = [
  "Misión por tomar",
  "Misión aceptada",
  "En misión",
  "Misión cumplida"
];

export function isMissionPending(mission: ActiveMission | null) {
  return mission?.mission_status === "Misión por tomar";
}

export function isMissionActive(mission: ActiveMission | null) {
  return mission?.mission_status === "Misión aceptada" || mission?.mission_status === "En misión";
}

export function isMissionClosed(mission: ActiveMission | null) {
  return mission?.mission_status === "Misión cumplida" || mission?.mission_status === "Misión cancelada";
}

const ACTIVE_MISSION_KEY = "orbi_active_mission";
const MISSION_CHANGE_EVENT = "orbi-mission-change";

export function createMission(mission: Omit<ActiveMission, "id" | "last_updated_at">) {
  const nextMission: ActiveMission = {
    ...mission,
    id: crypto.randomUUID(),
    last_updated_at: new Date().toISOString()
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
    return JSON.parse(rawMission) as ActiveMission;
  } catch {
    return null;
  }
}

export function saveActiveMission(mission: ActiveMission) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission));
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

export function updateActiveMission(update: Partial<ActiveMission>) {
  const currentMission = getActiveMission();
  if (!currentMission) {
    return null;
  }

  const nextMission: ActiveMission = {
    ...currentMission,
    ...update,
    last_updated_at: new Date().toISOString()
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
