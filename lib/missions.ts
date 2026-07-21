import { supabase, subscribeToTableChanges } from "@/lib/supabase";

export const missionStatuses = [
  "esperando_negocio",
  "preparando",
  "por_tomar",
  "aceptada",
  "en_mision",
  "cumplida",
  "cancelada",
  "archivada"
] as const;

export type MissionStatus = (typeof missionStatuses)[number];

export const missionStatusLabels: Record<MissionStatus, string> = {
  esperando_negocio: "Esperando confirmación del negocio",
  preparando: "Preparando tu pedido",
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
  /**
   * Identidad Supabase Auth del cliente autenticado.
   * Fuente de verdad para owner_id en el ledger cuando el cliente tiene cuenta.
   */
  user_id?: string;
  /**
   * Identidad temporal del cliente invitado.
   * Se genera en el primer pedido y persiste en localStorage hasta que el cliente
   * se autentique. Actúa como puente hacia user_id: cuando el cliente crea una
   * cuenta, sus misiones previas con guest_id pueden vincularse a su customer_id
   * definitivo. No es un identificador del dispositivo — es un identificador
   * provisional del cliente, agnóstico al mecanismo de almacenamiento.
   */
  guest_id?: string;
  detail: string;
  business_id?: string;
  product_id?: string;
  business_lat?: number | null;
  business_lng?: number | null;
  product_name?: string;
  business_name?: string;
  product_price?: number;
  items?: Array<{
    product_id:   string;
    product_name: string;
    business_id:  string;
    business_name: string;
    quantity:     number;
    price:        number;
    subtotal:     number;
    category:     string;
  }>;
  subtotal_productos?: number;
  service_fee?: number;
  total_estimado?: number;
  total?: number;
  distance_km?: number | null;
  duration_min?: number | null;
  // [lat, lng] pairs stored in Leaflet order (converted from GeoJSON [lng, lat] at write time)
  route_geometry?: [number, number][] | null;
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
  // Campos geográficos enriquecidos (Etapa 1 — columnas ya en DB, ORBI_GEO_CONTRACT.md).
  // Todos opcionales: misiones antiguas no los tendrán; las nuevas los recibirán del draft v2.
  origin_place_name?: string | null;
  origin_provider_id?: string | null;
  origin_provider?: string | null;
  origin_confirmed?: boolean | null;
  origin_reference?: string | null;
  destination_place_name?: string | null;
  destination_provider_id?: string | null;
  destination_provider?: string | null;
  destination_confirmed?: boolean | null;
  destination_reference?: string | null;
  mission_type?: "directa" | "compra_negocio";
  estimated_orbit: string;
  status: MissionStatus;
  mission_status?: MissionStatus | string;
  created_at?: string;
  last_updated_at: string;
  updated_at: string;
  cancelled_by?: string;
  cancelled_at?: string;
};

type CreateMissionInput = Omit<ActiveMission, "id" | "last_updated_at" | "updated_at" | "status" | "mission_status"> & {
  id?: string;             // idempotency key — same draft → same mission, never duplicated
  status?: MissionStatus;
  mission_status?: MissionStatus | string;
  expected_service_fee?: number;   // G1: cotización confirmada por el cliente antes de crear
  expected_total_amount?: number;  // G1: cotización confirmada por el cliente antes de crear
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

/**
 * Puntos de no retorno por tipo de misión (actualizado 2026-07-15):
 *   - Catálogo (business_id presente): punto de no retorno = negocio confirma → preparando.
 *     Cancelable en: esperando_negocio.
 *   - Directa (sin business_id): punto de no retorno = agente acepta → aceptada.
 *     Cancelable en: por_tomar (nadie ha aceptado aún).
 */
export function isCancellableByCustomer(mission: ActiveMission | null): boolean {
  if (!mission) return false;
  if (mission.status === "esperando_negocio") return true;
  if (mission.status === "por_tomar" && !mission.business_id) return true;
  return false;
}

export function getMissionStatusLabel(status: MissionStatus) {
  return missionStatusLabels[status];
}


export function canTransitionMission(currentStatus: MissionStatus, nextStatus: MissionStatus) {
  return (
    (currentStatus === "esperando_negocio" && (nextStatus === "preparando" || nextStatus === "cancelada")) ||
    (currentStatus === "preparando" && (nextStatus === "por_tomar" || nextStatus === "cancelada")) ||
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
export const MISSION_CHANGE_EVENT = "orbi-mission-change";

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

  // Terminal states (cumplida, cancelada, archivada) arriving from Supabase realtime
  // are always honoured regardless of the current local status. The client may have
  // missed intermediate transitions (e.g. localStorage says por_tomar but Supabase
  // already reached cumplida). This is authoritative reconciliation — not a path
  // available from the UI for arbitrary local state jumps.
  const isTerminal = isMissionClosed({ status: nextStatus } as ActiveMission);
  if (!isTerminal && nextStatus !== existing.status && !canTransitionMission(existing.status, nextStatus)) {
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

/**
 * Removes a mission from BOTH orbi_active_missions (new) and orbi_active_mission
 * (legacy). Use this for authoritative cleanup — e.g. when Supabase confirms a
 * mission is terminal or no longer exists, so it cannot resurface on next mount.
 */
export function removeActiveMissionFull(id: string): void {
  if (typeof window === "undefined") return;
  const next = getActiveMissions().filter((m) => m.id !== id);
  window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(next));
  try {
    const raw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
    if (raw) {
      const m = JSON.parse(raw) as { id?: string };
      if (m.id === id) window.localStorage.removeItem(ACTIVE_MISSION_KEY);
    }
  } catch { /* corrupt legacy key — ignore */ }
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

/**
 * Replaces the full local entry for a mission with the authoritative Supabase row.
 * Used during mount reconciliation to ensure ALL fields (status, agent, amounts, etc.)
 * match Supabase — not just the status field. If the authoritative mission is terminal,
 * it is removed from the active array entirely.
 */
export function replaceActiveMissionFull(mission: ActiveMission): void {
  if (typeof window === "undefined") return;
  const current = getActiveMissions();
  const index = current.findIndex((m) => m.id === mission.id);
  if (index === -1) return; // not tracked locally — nothing to replace
  if (isMissionClosed(mission)) {
    window.localStorage.setItem(
      ACTIVE_MISSIONS_KEY,
      JSON.stringify(current.filter((m) => m.id !== mission.id))
    );
    try {
      const raw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
      if (raw) {
        const m = JSON.parse(raw) as { id?: string };
        if (m.id === mission.id) window.localStorage.removeItem(ACTIVE_MISSION_KEY);
      }
    } catch { /* ignore */ }
  } else {
    const next = [...current];
    next[index] = mission;
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(next));
  }
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));
}

/** Three-way result for mount reconciliation — distinguishes network failure from "not found". */
export type MissionReconciliationResult =
  | { type: "found"; mission: ActiveMission }
  | { type: "not_found" }
  | { type: "network_error" };

/** Result of the full array reconciliation. */
export type ReconcileResult =
  | { type: "ok"; mission: ActiveMission | null }
  | { type: "network_error" };

/**
 * Checks whether a mission belongs to the current session.
 * Authenticated users are matched by user_id; guests by phone (any phone field).
 */
function missionBelongsToSession(
  mission: ActiveMission,
  session: { phone: string; userId?: string } | null
): boolean {
  if (!session) return false;
  if (session.userId) return mission.user_id === session.userId;
  const p = session.phone;
  return (
    mission.requester_phone === p ||
    mission.customer_phone === p ||
    mission.guest_phone === p
  );
}

/**
 * Reconciles the entire orbi_active_missions array against Supabase.
 * Transactional from the UI perspective:
 *   - Reads all local IDs (array + legacy key)
 *   - Verifies each against Supabase in parallel
 *   - Builds the reconciled array entirely in memory
 *   - Writes localStorage exactly once
 *   - Dispatches MISSION_CHANGE_EVENT exactly once
 *
 * Returns { type: "network_error" } if any Supabase call fails.
 * Returns { type: "ok", mission } with the single mission the UI should show
 * (null if none remain after reconciliation).
 */
export async function reconcileActiveMissions(
  session: { phone: string; userId?: string } | null
): Promise<ReconcileResult> {
  if (typeof window === "undefined") return { type: "ok", mission: null };

  // Collect unique IDs from array + legacy key.
  const localMissions = getActiveMissions();
  const idSet = new Set<string>(localMissions.map((m) => m.id));
  try {
    const legacyRaw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as { id?: string };
      if (parsed.id) idSet.add(parsed.id);
    }
  } catch { /* corrupt legacy — ignore */ }

  if (idSet.size === 0) {
    // Nothing to verify — ensure legacy key is clean and return.
    window.localStorage.removeItem(ACTIVE_MISSION_KEY);
    return { type: "ok", mission: null };
  }

  // Verify all IDs in parallel.
  const ids = Array.from(idSet);
  const results = await Promise.all(ids.map((id) => fetchMissionForReconciliation(id)));

  // If any call failed, abort without touching localStorage.
  if (results.some((r) => r.type === "network_error")) {
    return { type: "network_error" };
  }

  // Build the reconciled array in memory.
  const reconciledArray: ActiveMission[] = [];
  for (let i = 0; i < ids.length; i++) {
    const result = results[i];
    if (result.type === "not_found") {
      console.log(`[reconcile] not_found — removing local entry`);
      continue;
    }
    if (result.type !== "found") continue;
    const { mission } = result;
    if (isMissionClosed(mission)) {
      console.log(`[reconcile] terminal (${mission.status}) — removing local entry`);
      continue;
    }
    if (!missionBelongsToSession(mission, session)) {
      console.log(`[reconcile] wrong_owner — removing from localStorage (Supabase untouched)`);
      continue;
    }
    reconciledArray.push(mission);
  }

  // Select the single mission to show, applying documented priority.
  let selected: ActiveMission | null = null;
  if (reconciledArray.length > 1) {
    console.warn(`[reconcile] WARN: ${reconciledArray.length} misiones activas para la misma sesión. Mostrando la de mayor prioridad.`);
    const priority: Record<string, number> = {
      en_mision: 0,
      aceptada: 1,
      por_tomar: 2,
      preparando: 3,
      esperando_negocio: 4,
    };
    reconciledArray.sort((a, b) => {
      const pa = priority[a.status] ?? 5;
      const pb = priority[b.status] ?? 5;
      if (pa !== pb) return pa - pb;
      // Tie-break: most recent created_at first
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
    selected = reconciledArray[0];
  } else if (reconciledArray.length === 1) {
    selected = reconciledArray[0];
  }

  // Persist exactly once — no individual add/remove calls that dispatch events.
  window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(reconciledArray));
  if (selected) {
    window.localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(selected));
  } else {
    window.localStorage.removeItem(ACTIVE_MISSION_KEY);
  }

  // Single event dispatch at the end.
  window.dispatchEvent(new Event(MISSION_CHANGE_EVENT));

  return { type: "ok", mission: selected };
}

/**
 * Fetches a mission by id from Supabase specifically for mount reconciliation.
 * Returns "not_found" only when Supabase confirms the row doesn't exist.
 * Returns "network_error" for any connectivity or DB error — callers must
 * NOT delete local state on network_error.
 */
export async function fetchMissionForReconciliation(id: string): Promise<MissionReconciliationResult> {
  try {
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[missions] reconciliation error:", error.message);
      return { type: "network_error" };
    }
    if (!data) return { type: "not_found" };
    return { type: "found", mission: normalizeMission(data) as ActiveMission };
  } catch (err) {
    console.error("[missions] reconciliation exception:", err);
    return { type: "network_error" };
  }
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

export async function createMission(mission: CreateMissionInput): Promise<ActiveMission> {
  const now = new Date().toISOString();

  // Construir el objeto local para addActiveMission y el retorno inmediato.
  // Los campos financieros que aquí calculamos son provisionales para la UI —
  // el servidor los recalculará de forma independiente y guardará los suyos.
  const nextMission: ActiveMission = {
    ...mission,
    id: mission.id ?? crypto.randomUUID(),
    // Asignar identidad temporal si el cliente no está autenticado.
    // user_id tiene precedencia cuando existe (cliente con cuenta registrada).
    guest_id: undefined,
    status: normalizeMissionStatus(mission.status ?? mission.mission_status),
    mission_status: undefined,
    customer_name: mission.customer_name || mission.requester_name,
    customer_phone: mission.customer_phone || mission.requester_phone,
    guest_name: mission.guest_name || mission.requester_name,
    guest_phone: mission.guest_phone || mission.requester_phone,
    total_amount: mission.total_amount ?? mission.total ?? mission.precio_servicio ?? 0,
    created_at: mission.created_at || now,
    last_updated_at: now,
    updated_at: now,
  };

  // El API route es la única autoridad para calcular y persistir los campos
  // financieros (service_fee, total_amount, costo_agente, ganancia_orbi).
  // Los valores que nextMission trae del cliente son ignorados por el servidor.
  const res = await fetch("/api/missions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextMission),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Error al crear misión (HTTP ${res.status})`);
  }

  // El servidor devuelve la misión con los precios autoritativos.
  // Actualizamos el objeto local para que el estado en memoria sea consistente.
  const { mission: serverMission } = await res.json() as { mission: ActiveMission };
  const finalMission: ActiveMission = {
    ...nextMission,
    // Sobrescribir con los valores del servidor — estos son los que están en DB.
    total_amount:       serverMission.total_amount       ?? nextMission.total_amount,
    service_fee:        serverMission.service_fee        ?? nextMission.service_fee,
    subtotal_productos: serverMission.subtotal_productos ?? nextMission.subtotal_productos,
    costo_agente:       serverMission.costo_agente       ?? nextMission.costo_agente,
    ganancia_orbi:      serverMission.ganancia_orbi      ?? nextMission.ganancia_orbi,
    pricing_rule:       serverMission.pricing_rule       ?? nextMission.pricing_rule,
  };

  addActiveMission(finalMission);

  return finalMission;
}

// Maps an ActiveMission to the columns that exist in public.missions.
// Fields not in the table are deliberately omitted.
function missionToRow(m: ActiveMission) {
  return {
    id: m.id,
    guest_id: m.guest_id ?? null,
    user_id:  m.user_id  ?? null,
    status: m.status,
    service_type: m.service_type,
    detail: m.detail,
    business_id:   m.business_id   ?? null,
    business_name: m.business_name ?? null,
    origin_text: m.origin_text,
    origin_lat: m.origin_lat ?? null,
    origin_lng: m.origin_lng ?? null,
    destination_text: m.destination_text,
    destination_lat: m.destination_lat ?? null,
    destination_lng: m.destination_lng ?? null,
    // Campos geográficos enriquecidos — ORBI_GEO_CONTRACT.md.
    // Null para misiones creadas antes del draft v2 (compatibilidad total con v1).
    origin_place_name:       m.origin_place_name       ?? null,
    origin_provider_id:      m.origin_provider_id      ?? null,
    origin_provider:         m.origin_provider         ?? null,
    origin_confirmed:        m.origin_confirmed        ?? null,
    origin_reference:        m.origin_reference        ?? null,
    destination_place_name:  m.destination_place_name  ?? null,
    destination_provider_id: m.destination_provider_id ?? null,
    destination_provider:    m.destination_provider    ?? null,
    destination_confirmed:   m.destination_confirmed   ?? null,
    destination_reference:   m.destination_reference   ?? null,
    requester_name: m.requester_name,
    requester_phone: m.requester_phone,
    selected_agent_id: m.selected_agent_id || null,
    selected_agent_name: m.selected_agent_name || null,
    active_agent_id: m.active_agent_id ?? null,
    accepted_at: m.accepted_at ?? null,
    payment_status: m.payment_status,
    payment_method: m.payment_method,
    total_amount:        m.total_amount        ?? null,
    costo_agente:        m.costo_agente        ?? null,
    ganancia_orbi:       m.ganancia_orbi       ?? null,
    subtotal_productos:  m.subtotal_productos  ?? null,
    service_fee:         m.service_fee         ?? null,
    pricing_rule:        m.pricing_rule        ?? null,
    estimated_orbit: m.estimated_orbit,
    mission_type: m.mission_type ?? "directa",
    distance_km: m.distance_km ?? null,
    duration_min: m.duration_min ?? null,
    route_geometry: m.route_geometry ?? null,
    created_at: m.created_at ?? null,
    updated_at: m.updated_at,
  };
}

// Fetches non-closed missions from Supabase and writes them into localStorage so
// all devices share the same mission state. Call before getActiveMissions() in
// component load functions.
export async function loadActiveMissionsFromSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .not("status", "in", "(cumplida,cancelada,archivada)");
    if (error) {
      console.error("[missions] SELECT failed:", error);
      return;
    }
    if (!data) return;
    const normalized = data.map(normalizeMission) as ActiveMission[];
    window.localStorage.setItem(ACTIVE_MISSIONS_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error("[missions] loadActiveMissionsFromSupabase error:", err);
  }
}

// ---------------------------------------------------------------------------
// Supabase-first mission actions — source of truth is Supabase, not localStorage
// ---------------------------------------------------------------------------

/**
 * Returns the single active mission for an authenticated user.
 * This is the authoritative read path for /pedir — no localStorage involved.
 * Returns null if the user has no active mission or on network error.
 */
export async function fetchActiveMission(userId: string): Promise<ActiveMission | null> {
  try {
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .eq("user_id", userId)
      .not("status", "in", "(cumplida,cancelada,archivada)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[missions] fetchActiveMission error:", error.message);
      return null;
    }
    if (!data) return null;
    return normalizeMission(data) as ActiveMission;
  } catch {
    return null;
  }
}

/** Fetch completed/cancelled missions for a given phone number from Supabase. */
export async function fetchMissionHistoryByPhone(phone: string): Promise<ActiveMission[]> {
  const normalized = phone.replace(/\D/g, "");
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .in("status", ["cumplida", "cancelada"])
    .or(`requester_phone.eq.${normalized},requester_phone.eq.+52${normalized}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.error("[missions] fetchMissionHistoryByPhone error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

export type CustomerMissionStats = {
  total: number;
  cumplidas: number;
  canceladas: number;
  lastDate: string | null;
};

const HISTORY_BY_PHONE_PAGE = 10;

/** KPIs — counts only cumplida + cancelada. Archivadas excluded from totals. */
export async function fetchMissionStats(
  userId: string
): Promise<CustomerMissionStats> {
  const { data, error } = await supabase
    .from("missions")
    .select("status,created_at")
    .in("status", ["cumplida", "cancelada"])
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) return { total: 0, cumplidas: 0, canceladas: 0, lastDate: null };
  const rows = data as { status: string; created_at: string }[];
  return {
    total: rows.length,
    cumplidas: rows.filter((r) => r.status === "cumplida").length,
    canceladas: rows.filter((r) => r.status === "cancelada").length,
    lastDate: rows[0]?.created_at ?? null,
  };
}

/** Paginated mission history — cumplida + cancelada + archivada — ordered by created_at DESC. */
export async function fetchMissionHistoryPaged(
  userId: string,
  page: number
): Promise<{ missions: ActiveMission[]; hasMore: boolean; total: number }> {
  const from = page * HISTORY_BY_PHONE_PAGE;
  const to = from + HISTORY_BY_PHONE_PAGE - 1;

  const { data, error, count } = await supabase
    .from("missions")
    .select("id,status,service_type,destination_text,total_amount,created_at,updated_at", { count: "exact" })
    .in("status", ["cumplida", "cancelada", "archivada"])
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[missions] fetchMissionHistoryPaged error:", error);
    return { missions: [], hasMore: false, total: 0 };
  }
  const total = count ?? 0;
  return {
    missions: (data ?? []).map(normalizeMission) as ActiveMission[],
    hasMore: to + 1 < total,
    total,
  };
}


/** Fetch a single mission by id directly from Supabase. */
export async function fetchMissionById(id: string): Promise<ActiveMission | null> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) { console.error("[missions] fetchMissionById error:", error); return null; }
  return data ? (normalizeMission(data) as ActiveMission) : null;
}

const ADMIN_MISSIONS_LIMIT = 100;

/** Fetch operationally active missions for the admin dashboard.
 *  Scoped to live statuses only — history with pagination comes in a later phase. */
export async function fetchAllMissionsForAdmin(): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .in("status", ["esperando_negocio", "preparando", "por_tomar", "aceptada", "en_mision"])
    .order("updated_at", { ascending: false })
    .limit(ADMIN_MISSIONS_LIMIT);
  if (error) { console.error("[missions] fetchAllMissionsForAdmin error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

const HISTORY_PAGE_SIZE = 25;

export type MissionHistoryFilters = {
  page?: number;
  serviceType?: string;
  agentName?: string;
  status?: string;
  requesterSearch?: string;
  search?: string;
};

/** Fetch closed missions for the paginated history panel.
 *  Filters applied server-side — no client-side filtering, no realtime. */
export async function fetchMissionHistory(
  filters: MissionHistoryFilters = {}
): Promise<{ missions: ActiveMission[]; hasMore: boolean; total: number }> {
  const { page = 0, serviceType, agentName, status, requesterSearch, search } = filters;

  let query = supabase
    .from("missions")
    .select(
      "id,status,service_type,requester_name,selected_agent_name,total_amount,created_at,payment_method,payment_status",
      { count: "exact" }
    )
    .in("status", ["cumplida", "cancelada", "archivada"])
    .order("created_at", { ascending: false })
    .range(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE - 1);

  if (serviceType && serviceType !== "Todos") {
    query = query.eq("service_type", serviceType);
  }
  if (status && status !== "Todos") {
    query = query.eq("status", status as MissionStatus);
  }
  if (agentName?.trim()) {
    query = query.ilike("selected_agent_name", `%${agentName.trim()}%`);
  }
  if (requesterSearch?.trim()) {
    query = query.ilike("requester_name", `%${requesterSearch.trim()}%`);
  }
  if (search?.trim()) {
    // Strip folio prefixes/symbols before deciding how to filter.
    const stripped = search
      .replace(/folio:/gi, "")
      .replace(/#/g, "")
      .trim()
      .toLowerCase();

    if (stripped) {
      const isFolioTerm = /^[0-9a-f]{4,12}$/.test(stripped);
      if (!isFolioTerm) {
        // Text search: filter server-side across readable fields.
        query = query.or(
          `requester_name.ilike.%${stripped}%,selected_agent_name.ilike.%${stripped}%,service_type.ilike.%${stripped}%`
        );
      }
      // Folio terms: no server filter — UUID column ilike is unreliable.
      // The component's client filter matches visible rows by m.id suffix.
    }
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[missions] fetchMissionHistory error:", error);
    return { missions: [], hasMore: false, total: 0 };
  }

  const missions = (data ?? []).map(normalizeMission) as ActiveMission[];
  const total = count ?? 0;
  const hasMore = (page + 1) * HISTORY_PAGE_SIZE < total;

  return { missions, hasMore, total };
}

/** Fetch completed missions for ranking calculations.
 *  Minimal column select — only what's needed for agent, business, and customer rankings. */
export async function fetchMissionsForRankings(): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("selected_agent_id,selected_agent_name,business_name,requester_phone,requester_name,total_amount,status,created_at")
    .eq("status", "cumplida")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { console.error("[missions] fetchMissionsForRankings error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

/** Fetch missions for the distribution dashboard (service type + payment method).
 *  Excludes archived missions only — includes active, completed, and cancelled.
 *  Uses a minimal column select to keep payload small. */
export async function fetchMissionsForDistribution(): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("id,status,service_type,payment_method,created_at")
    .neq("status", "archivada")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) { console.error("[missions] fetchMissionsForDistribution error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

/** Fetch completed and cancelled missions for the economy dashboard.
 *  Uses a minimal column select — only fields needed for economic metrics. */
export async function fetchMissionsForEconomy(): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("id,status,service_type,total_amount,payment_method,created_at,updated_at,requester_name,selected_agent_name")
    .in("status", ["cumplida", "cancelada"])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) { console.error("[missions] fetchMissionsForEconomy error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

/** Fetch active missions directly from Supabase (no localStorage). */
export async function fetchActiveMissions(): Promise<ActiveMission[]> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .not("status", "in", "(cumplida,cancelada,archivada)")
    .gte("created_at", cutoff)
    .not("requester_name", "ilike", "%test%")
    .not("requester_name", "ilike", "%e2e%")
    .not("requester_name", "ilike", "%prueba%");
  if (error) {
    console.error("[missions] fetchActiveMissions error:", error);
    return [];
  }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

/** Business accepts order → esperando_negocio → preparando (starts preparation). */
export async function confirmMissionByBusiness(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("missions")
    .update({ status: "preparando", updated_at: now })
    .eq("id", id)
    .eq("status", "esperando_negocio")
    .select("id,status");
  if (error) { console.error("[missions] confirmMissionByBusiness error:", error); return false; }
  const updated = Array.isArray(data) ? data[0] : null;
  if (!updated) { console.error("[missions] confirmMissionByBusiness — 0 filas afectadas"); return false; }
  return true;
}

/** Business marks order ready → preparando → por_tomar so agent can see it. */
export async function markOrderReadyByBusiness(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("missions")
    .update({ status: "por_tomar", updated_at: now })
    .eq("id", id)
    .eq("status", "preparando")
    .select("id,status");
  if (error) { console.error("[missions] markOrderReadyByBusiness error:", error); return false; }
  const updated = Array.isArray(data) ? data[0] : null;
  if (!updated) { console.error("[missions] markOrderReadyByBusiness — 0 filas afectadas"); return false; }
  return true;
}

/** Fetch missions waiting for or being prepared by a specific business. */
export async function fetchBusinessPendingMissions(businessName: string): Promise<ActiveMission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .in("status", ["esperando_negocio", "preparando"])
    .eq("business_name", businessName)
    .order("created_at", { ascending: false });
  if (error) { console.error("[missions] fetchBusinessPendingMissions error:", error); return []; }
  return (data ?? []).map(normalizeMission) as ActiveMission[];
}

/** Agent accepts a por_tomar mission. Returns updated row or null on conflict.
 *  Accepts if selected_agent_id is null (open mission) or already matches agentId (pre-assigned). */
export async function acceptMission(
  id: string,
  agentId: string,
  agentName: string,
  opts?: { zone?: string; vehicle?: string; trust?: string; lat?: number | null; lng?: number | null }
): Promise<ActiveMission | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("missions")
    .update({
      status: "aceptada",
      selected_agent_id: agentId,
      selected_agent_name: agentName,
      active_agent_id: agentId,
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "por_tomar")
    .or(`selected_agent_id.is.null,selected_agent_id.eq.${agentId}`)
    .select("*");
  if (error) { console.error("[missions] acceptMission error:", error); return null; }
  const row = Array.isArray(data) ? data[0] : null;
  return row ? (normalizeMission(row) as ActiveMission) : null;
}

/** Agent starts route: aceptada → en_mision. */
export async function startMission(id: string, agentId: string): Promise<ActiveMission | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("missions")
    .update({ status: "en_mision", updated_at: now })
    .eq("id", id)
    .eq("status", "aceptada")
    .eq("selected_agent_id", agentId)
    .select("*")
    .maybeSingle();
  if (error) { console.error("[missions] startMission error:", error); return null; }
  return data ? (normalizeMission(data) as ActiveMission) : null;
}

/**
 * Resultado tipado del cierre de misión con ledger.
 *
 * - ok:              200 — misión cumplida + ledger escrito. Todo correcto.
 * - ledger_pending:  207 — misión cumplida en DB pero INSERT del ledger falló.
 *                    Retriable de forma segura (el endpoint es idempotente).
 * - error:           5xx / red — misión sigue en_mision. Retry seguro.
 */
export type MissionCompleteResult =
  | { status: "ok";             mission: ActiveMission }
  | { status: "ledger_pending"; mission: ActiveMission }
  | { status: "error";          message: string };

/**
 * Cierra la misión Y escribe los movimientos contables en ledger_entries.
 * Llama al API route /api/missions/complete (SERVICE_ROLE_KEY server-side).
 *
 * Sin fallback: si el endpoint falla la misión permanece en_mision y el
 * caller debe mostrar un error con botón de reintento. El endpoint es
 * idempotente — el retry es siempre seguro.
 */
export async function completeMissionWithLedger(
  id: string,
  agentId: string,
  agentToken: string
): Promise<MissionCompleteResult> {
  const token = agentToken;
  if (!token) {
    return { status: "error", message: "Sesión expirada. Vuelve a iniciar sesión e intenta de nuevo." };
  }

  let res: Response;
  try {
    res = await fetch("/api/missions/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ mission_id: id, agent_id: agentId }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de red.";
    console.error("[missions] completeMissionWithLedger fetch error:", message);
    return { status: "error", message: "No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo." };
  }

  const body = await res.json().catch(() => ({})) as {
    mission?: ActiveMission;
    error?: string;
  };

  if (res.status === 207) {
    // Misión cumplida en DB pero ledger no se escribió — retriable.
    console.warn("[missions] completeMissionWithLedger: ledger pendiente (207)", id);
    return {
      status: "ledger_pending",
      mission: normalizeMission(body.mission!) as ActiveMission,
    };
  }

  if (!res.ok) {
    const message = body.error ?? `Error al cerrar la misión (HTTP ${res.status}).`;
    console.error("[missions] completeMissionWithLedger error:", message);
    return { status: "error", message };
  }

  return {
    status: "ok",
    mission: normalizeMission(body.mission!) as ActiveMission,
  };
}

/** Customer cancels mission. Backend guards esperando_negocio only. Returns ok=true on success. */
export async function cancelMissionByCustomer(id: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("/api/missions/cancel-customer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission_id: id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      console.error("[missions] cancelMissionByCustomer error:", body.error ?? res.status);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[missions] cancelMissionByCustomer fetch error:", err);
    return { ok: false };
  }
}

/** Agent cancels assigned mission → resets to por_tomar for reassignment. */
export async function cancelMissionByAgent(id: string, agentId: string): Promise<boolean> {
  // Log estado real en Supabase ANTES del UPDATE
  const { data: before } = await supabase
    .from("missions")
    .select("id, status, selected_agent_id, selected_agent_name, active_agent_id")
    .eq("id", id)
    .maybeSingle();
  if (before) {
    const guardStatus = ["aceptada", "en_mision"].includes(before.status ?? "");
    const guardAgent  = before.selected_agent_id === agentId;
    if (!guardStatus) console.error("[missions] cancelMissionByAgent: status inválido:", before.status);
    if (!guardAgent)  console.error("[missions] cancelMissionByAgent: agente no coincide:", before.selected_agent_id, "vs", agentId);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("missions")
    .update({
      status: "por_tomar",
      selected_agent_id: null,
      selected_agent_name: null,
      active_agent_id: null,
      accepted_at: null,
      updated_at: now,
    })
    .eq("id", id)
    .eq("selected_agent_id", agentId)
    .in("status", ["aceptada", "en_mision"])
    .select("id, status, selected_agent_id, selected_agent_name, active_agent_id");
  if (error) {
    console.error("[missions] cancelMissionByAgent error:", error);
    return false;
  }
  const updated = Array.isArray(data) ? data[0] : null;
  if (!updated) {
    console.error("[missions] cancelMissionByAgent: UPDATE afectó 0 filas");
    return false;
  }
  return true;
}

// Returns the most-relevant single active mission (highest-priority status).
export function getActiveMission(): ActiveMission | null {
  if (typeof window === "undefined") return null;

  const missions = getActiveMissions();
  if (missions.length === 0) {
    // Fallback: try legacy key (safety net during migration window).
    try {
      const raw = window.localStorage.getItem(ACTIVE_MISSION_KEY);
      if (!raw) return null;
      const m = normalizeMission(JSON.parse(raw)) as ActiveMission;
      if (isMissionClosed(m)) {
        // Stale closed entry in legacy key — clean it up so it never resurfaces.
        window.localStorage.removeItem(ACTIVE_MISSION_KEY);
        return null;
      }
      return m;
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
