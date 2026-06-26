import { supabase } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

const DELETED_AGENTS_KEY = "orbi_deleted_agent_ids";

export const agentServiceTypes = [
  "Todos los servicios",
  "Mandados",
  "Entregas",
  "Traslados",
  "Compras",
  "Recolecciones"
] as const;

export type AgentServiceType = (typeof agentServiceTypes)[number];

export const AGENT_STATUS = {
  ONLINE: "Disponible",
  OFFLINE: "Fuera de servicio"
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export const agentLevels = ["Aprendiz", "Experto", "Elite"] as const;

export type AgentTrustLevel = (typeof agentLevels)[number];

// ── Public type ───────────────────────────────────────────────────────────────

export type OrbiAgent = {
  id: string;
  authUserId?: string;
  email?: string;
  name: string;
  photoUrl: string;
  initials: string;
  serviceType: AgentServiceType;
  zone: string;
  status: AgentStatus;
  isOnOrbit: boolean;
  trustLevel: AgentTrustLevel;
  phone: string;
  description: string;
  vehicle: string;
  availability: string;
  lat: number | null;
  lng: number | null;
  currentLat: number | null;
  currentLng: number | null;
  radiusKm: number;
  isDemo?: boolean;
};

export type CreateAgentInput = Omit<OrbiAgent, "id">;

// ── Internal DB types ─────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string;
  photo_url: string | null;
  initials: string | null;
  service_type: string;
  zone: string;
  status: string;
  trust_level: string;
  phone: string;
  description: string;
  vehicle: string | null;
  availability: string | null;
  lat: number | string | null;
  lng: number | string | null;
  radius_km: number | string | null;
  is_on_orbit: boolean | null;
  current_lat: number | string | null;
  current_lng: number | string | null;
};

// Exact columns present in public.agents — never add columns that don't exist.
const SELECT =
  "id,name,email,photo_url,initials,service_type,zone,status,trust_level," +
  "phone,description,vehicle,availability,lat,lng,radius_km," +
  "is_on_orbit,current_lat,current_lng,auth_user_id";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function validCoords(lat: number | null, lng: number | null): lat is number {
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function normalizeStatus(s: string): AgentStatus {
  return s === AGENT_STATUS.ONLINE || s === "En órbita" ? AGENT_STATUS.ONLINE : AGENT_STATUS.OFFLINE;
}

function normalizeLevel(l: string): AgentTrustLevel {
  if (l === "Elite" || l === "Experto" || l === "Aprendiz") return l;
  return l === "Verificado" ? "Experto" : "Aprendiz";
}

function normalizeServiceType(s: string): AgentServiceType {
  return (agentServiceTypes as readonly string[]).includes(s)
    ? (s as AgentServiceType)
    : "Todos los servicios";
}

function fromRow(row: AgentRow): OrbiAgent {
  return {
    id: row.id,
    authUserId: row.auth_user_id ?? undefined,
    email: row.email ?? undefined,
    name: row.name,
    photoUrl: row.photo_url ?? "",
    initials: row.initials ?? getAgentInitials(row.name),
    serviceType: normalizeServiceType(row.service_type),
    zone: row.zone,
    status: normalizeStatus(row.status),
    isOnOrbit: row.is_on_orbit ?? false,
    trustLevel: normalizeLevel(row.trust_level),
    phone: row.phone,
    description: row.description,
    vehicle: row.vehicle ?? "",
    availability: row.availability ?? "",
    lat: toNum(row.lat),
    lng: toNum(row.lng),
    currentLat: toNum(row.current_lat),
    currentLng: toNum(row.current_lng),
    radiusKm: toNum(row.radius_km) ?? 20,
    isDemo: !hasValidAgentId({ id: row.id })
  };
}

function client() {
  if (!supabase) throw new Error("Supabase no configurado.");
  return supabase;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getAgents(): Promise<OrbiAgent[]> {
  const { data, error } = await client()
    .from("agents")
    .select(SELECT)
    .neq("status", AGENT_STATUS.OFFLINE)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const deletedIds = getLocallyDeletedAgentIds();
  return ((data ?? []) as unknown as AgentRow[])
    .filter((r) => !deletedIds.includes(r.id))
    .map(fromRow);
}

export async function getAgentById(id: string): Promise<OrbiAgent | null> {
  const { data, error } = await client()
    .from("agents")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? fromRow(data as unknown as AgentRow) : null;
}

export async function getAgentByEmail(email: string): Promise<OrbiAgent | null> {
  if (!email.trim()) return null;
  const { data, error } = await client()
    .from("agents")
    .select(SELECT)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error) return null;
  return data ? fromRow(data as unknown as AgentRow) : null;
}

export async function getAgentByAuthUserId(authUserId: string): Promise<OrbiAgent | null> {
  if (!authUserId.trim()) return null;
  const { data, error } = await client()
    .from("agents")
    .select(SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? fromRow(data as unknown as AgentRow) : null;
}

// ── Writes ────────────────────────────────────────────────────────────────────

export async function createAgent(input: CreateAgentInput): Promise<OrbiAgent> {
  const payload = {
    name: input.name,
    email: input.email ?? null,
    photo_url: input.photoUrl || null,
    initials: input.initials || null,
    service_type: input.serviceType,
    zone: input.zone,
    status: input.status,
    is_on_orbit: input.isOnOrbit,
    trust_level: input.trustLevel,
    phone: input.phone,
    description: input.description,
    vehicle: input.vehicle || null,
    availability: input.availability || null,
    lat: input.lat,
    lng: input.lng,
    current_lat: input.currentLat ?? input.lat,
    current_lng: input.currentLng ?? input.lng,
    radius_km: input.radiusKm || 20,
    auth_user_id: input.authUserId ?? null
  };

  const { error } = await client().from("agents").insert(payload);
  if (error) throw new Error(error.message);

  // Read back by email (most reliable after insert without RETURNING)
  const { data, error: selErr } = await client()
    .from("agents")
    .select(SELECT)
    .eq("email", payload.email ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!data) throw new Error("No se pudo leer el agente recién creado.");
  return fromRow(data as unknown as AgentRow);
}

export async function updateAgent(id: string, input: CreateAgentInput): Promise<OrbiAgent> {
  if (!hasValidAgentId({ id })) throw new Error("ID de agente inválido.");

  const payload = {
    name: input.name,
    photo_url: input.photoUrl || null,
    initials: input.initials || null,
    service_type: input.serviceType,
    zone: input.zone,
    status: input.status,
    is_on_orbit: input.isOnOrbit,
    trust_level: input.trustLevel,
    phone: input.phone,
    description: input.description,
    vehicle: input.vehicle || null,
    availability: input.availability || null,
    lat: input.lat,
    lng: input.lng,
    current_lat: input.isOnOrbit ? (input.currentLat ?? input.lat) : undefined,
    current_lng: input.isOnOrbit ? (input.currentLng ?? input.lng) : undefined,
    radius_km: input.radiusKm,
    auth_user_id: input.authUserId ?? null
  };

  const { data, error, count, status, statusText } = await client()
    .from("agents")
    .update(payload, { count: "exact" })
    .eq("id", id)
    .select(SELECT);

  if (error) throw new Error(error.message);
  if (count !== 1) {
    throw new Error(
      `UPDATE devolvió count=${count} (esperado 1) | id=${id} | status=${status} ${statusText} | vehicle=${payload.vehicle}`
    );
  }
  if (!data?.[0]) throw new Error(`UPDATE OK pero data vacío (id: ${id})`);

  return fromRow(data[0] as unknown as AgentRow);
}

export async function updateAgentOrbit(
  id: string,
  opts: {
    isOnOrbit: boolean;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
    serviceType?: AgentServiceType;
    availability?: string;
  }
): Promise<OrbiAgent> {
  if (!hasValidAgentId({ id })) throw new Error("ID de agente inválido.");

  const payload: Record<string, unknown> = {
    is_on_orbit: opts.isOnOrbit,
    status: AGENT_STATUS.ONLINE
  };

  if (opts.isOnOrbit && opts.lat != null) {
    payload.lat = opts.lat;
    payload.lng = opts.lng;
    payload.current_lat = opts.lat;
    payload.current_lng = opts.lng;
  }
  if (opts.radiusKm != null) payload.radius_km = opts.radiusKm;
  if (opts.serviceType) payload.service_type = opts.serviceType;
  if (opts.availability != null) payload.availability = opts.availability || null;

  const { error: upErr } = await client().from("agents").update(payload).eq("id", id);
  if (upErr) {
    console.error("[agents] orbit UPDATE error", upErr);
    throw new Error(upErr.message);
  }

  const { data, error: selErr } = await client()
    .from("agents")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);
  if (!data) throw new Error(`Órbita actualizada pero SELECT devolvió vacío (id: ${id}).`);
  return fromRow(data as unknown as AgentRow);
}

export async function deleteAgent(id: string): Promise<void> {
  if (!hasValidAgentId({ id })) throw new Error("ID de agente inválido.");
  markDeletedLocally(id);

  // Reset active missions assigned to this agent back to pending.
  await client()
    .from("missions")
    .update({
      status: "por_tomar",
      selected_agent_id: null,
      selected_agent_name: null,
      active_agent_id: null,
    })
    .eq("active_agent_id", id)
    .not("status", "in", "(cumplida,cancelada,archivada)");

  const { error } = await client().from("agents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setAgentTrustLevel(id: string, trustLevel: AgentTrustLevel): Promise<void> {
  const { error } = await client().from("agents").update({ trust_level: trustLevel }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setAgentActiveStatus(id: string, active: boolean): Promise<void> {
  const newStatus = active ? AGENT_STATUS.ONLINE : AGENT_STATUS.OFFLINE;
  const { error } = await client().from("agents").update({ status: newStatus }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function getAgentInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function hasValidAgentId(agent: { id?: unknown }): boolean {
  const id = typeof agent.id === "string" ? agent.id.trim() : "";
  return Boolean(id) && !/^(demo|mock|local|temp)[-_]/i.test(id);
}

export type AgentOperationalLocation = {
  lat: number;
  lng: number;
  source: "current" | "base";
};

export type AgentLocationDiagnostics = {
  hasValidLocation: boolean;
  location: AgentOperationalLocation | null;
  reason: string;
  fallbackWarning: string;
  checks: { label: string; lat: number | null; lng: number | null; isValid: boolean; reason: string }[];
};

export function getAgentOperationalLocation(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): AgentOperationalLocation | null {
  const pairs = [
    { lat: agent.currentLat, lng: agent.currentLng, source: "current" as const },
    { lat: agent.lat, lng: agent.lng, source: "base" as const }
  ];
  for (const p of pairs) {
    const lat = toNum(p.lat);
    const lng = toNum(p.lng);
    if (validCoords(lat, lng)) return { lat, lng: lng as number, source: p.source };
  }
  return null;
}

export function getAgentLocationDiagnostics(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): AgentLocationDiagnostics {
  const pairs = [
    { label: "current_lat/lng", lat: toNum(agent.currentLat), lng: toNum(agent.currentLng), source: "current" as const },
    { label: "lat/lng", lat: toNum(agent.lat), lng: toNum(agent.lng), source: "base" as const }
  ];
  const checks = pairs.map((p) => ({
    label: p.label,
    lat: p.lat,
    lng: p.lng,
    isValid: validCoords(p.lat, p.lng),
    reason: validCoords(p.lat, p.lng) ? "válida" : "inválida o ausente"
  }));
  const found = pairs.find((p) => validCoords(p.lat, p.lng));
  if (found) {
    return {
      hasValidLocation: true,
      location: { lat: found.lat as number, lng: found.lng as number, source: found.source },
      reason: `${found.label} válido.`,
      fallbackWarning: found.source !== "current" ? `Usando ${found.label} como fallback.` : "",
      checks
    };
  }
  return { hasValidLocation: false, location: null, reason: "sin coordenadas válidas", fallbackWarning: "", checks };
}

export const getAgentOperationalBase = (agent: Partial<OrbiAgent> & Record<string, unknown>) =>
  getAgentLocationDiagnostics(agent).location;

export const getAgentLocation = getAgentOperationalBase;

export function getAgentCurrentLocation(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): { lat: number; lng: number } | null {
  const lat = toNum(agent.currentLat);
  const lng = toNum(agent.currentLng);
  if (validCoords(lat, lng)) return { lat, lng: lng as number };
  if (agent.isOnOrbit) {
    const blat = toNum(agent.lat);
    const blng = toNum(agent.lng);
    if (validCoords(blat, blng)) return { lat: blat as number, lng: blng as number };
  }
  return null;
}

export function isAgentWithinOperatingHours(
  agent: Pick<OrbiAgent, "availability">,
  date = new Date()
): boolean {
  const av = agent.availability.trim().toLowerCase();
  if (!av || av === "24 horas") return true;
  const match = av.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (!match) return true;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const now = date.getHours() * 60 + date.getMinutes();
  const start = toMin(match[1]);
  const end = toMin(match[2]);
  if (start === end) return true;
  return start < end ? now >= start && now <= end : now >= start || now <= end;
}

export function getAgentOperatingEligibility(
  agent: OrbiAgent,
  serviceType: AgentServiceType,
  origin?: { lat: number; lng: number } | null,
  now = new Date()
) {
  const location = getAgentLocation(agent);
  const distanceKm =
    origin && location ? calcDistKm(origin.lat, origin.lng, location.lat, location.lng) : null;
  const radiusKm = agent.radiusKm || 20;

  if (agent.status !== AGENT_STATUS.ONLINE)
    return { eligible: false, reason: `fuera de servicio: ${agent.status}`, location, distanceKm };
  if (!agent.isOnOrbit)
    return { eligible: false, reason: "fuera de órbita", location, distanceKm };
  if (!isAgentWithinOperatingHours(agent, now))
    return { eligible: false, reason: "fuera de horario", location, distanceKm };
  if (!location)
    return { eligible: false, reason: "sin ubicación válida", location, distanceKm };
  if (!origin)
    return { eligible: false, reason: "sin origen para validar radio", location, distanceKm };
  if (distanceKm !== null && distanceKm > radiusKm)
    return { eligible: false, reason: `fuera de radio: ${distanceKm.toFixed(1)} km > ${radiusKm} km`, location, distanceKm };
  if (agent.serviceType !== "Todos los servicios" && agent.serviceType !== serviceType)
    return { eligible: false, reason: `servicio incompatible: ${agent.serviceType}`, location, distanceKm };

  return { eligible: true, reason: "elegible", location, distanceKm };
}

export function getAgentOperationalLabel(
  agent: OrbiAgent,
  now = new Date(),
  origin?: { lat: number; lng: number } | null
): string {
  if (agent.status !== AGENT_STATUS.ONLINE) return "Fuera de servicio";
  if (!agent.isOnOrbit) return "Fuera de órbita";
  if (!isAgentWithinOperatingHours(agent, now)) return "Fuera de horario";
  const location = getAgentLocation(agent);
  if (!location) return "Fuera de órbita";
  if (origin) {
    const d = calcDistKm(origin.lat, origin.lng, location.lat, location.lng);
    if (d > (agent.radiusKm || 20)) return "Fuera de zona";
  }
  return "En órbita";
}

// ── Private helpers ───────────────────────────────────────────────────────────

function calcDistKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const R = 6371;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLng = ((lngB - lngA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function markDeletedLocally(id: string) {
  if (typeof window === "undefined") return;
  const ids = new Set(getLocallyDeletedAgentIds());
  ids.add(id);
  window.localStorage.setItem(DELETED_AGENTS_KEY, JSON.stringify(Array.from(ids)));
}

function getLocallyDeletedAgentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(DELETED_AGENTS_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
