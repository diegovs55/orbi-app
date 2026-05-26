import { supabase } from "@/lib/supabase";

export const agentServiceTypes = [
  "Todos los servicios",
  "Mandados",
  "Entregas",
  "Traslados",
  "Compras",
  "Recolecciones"
] as const;

export type AgentServiceType = (typeof agentServiceTypes)[number];

export type AgentStatus = "En órbita" | "Fuera de órbita";

export type AgentTrustLevel = "Verificado" | "En validación";

export type OrbiAgent = {
  id: string;
  name: string;
  photoUrl: string;
  initials: string;
  serviceType: AgentServiceType;
  zone: string;
  status: AgentStatus;
  trustLevel: AgentTrustLevel;
  phone: string;
  description: string;
  vehicle: string;
  availability: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
};

export type CreateAgentInput = Omit<OrbiAgent, "id">;

type AgentRow = {
  id: string;
  name: string;
  photo_url: string | null;
  initials: string | null;
  service_type: AgentServiceType;
  zone: string;
  status: AgentStatus | "Disponible" | "Ocupado" | "Desconectado" | "Fuera de servicio";
  trust_level: AgentTrustLevel;
  phone: string;
  description: string;
  vehicle: string | null;
  availability: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
};

type AgentUpdate = {
  status: AgentStatus;
  lat?: number | null;
  lng?: number | null;
};

type AgentInsert = {
  name: string;
  photo_url: string | null;
  initials: string | null;
  service_type: AgentServiceType;
  zone: string;
  status: AgentStatus;
  trust_level: AgentTrustLevel;
  phone: string;
  description: string;
  vehicle: string | null;
  availability: string | null;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
};

export async function getAgents() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("agents")
    .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability,lat,lng,radius_km")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability")
      .order("status", { ascending: true })
      .order("name", { ascending: true });

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return (fallback.data ?? []).map(mapAgentRow);
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapAgentRow);
}

export async function createAgent(agent: CreateAgentInput) {
  const client = getSupabaseClient();

  const payload: AgentInsert = {
    name: agent.name,
    photo_url: agent.photoUrl || null,
    initials: agent.initials || null,
    service_type: agent.serviceType,
    zone: agent.zone,
    status: agent.status,
    trust_level: agent.trustLevel,
    phone: agent.phone,
    description: agent.description,
    vehicle: agent.vehicle || null,
    availability: agent.availability || null,
    lat: agent.lat,
    lng: agent.lng,
    radius_km: agent.radiusKm || 20
  };

  const { data, error } = await client
    .from("agents")
    .insert(payload)
    .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability,lat,lng,radius_km")
    .single();

  if (isMissingCoordinateColumnError(error)) {
    const fallbackPayload = {
      name: payload.name,
      photo_url: payload.photo_url,
      initials: payload.initials,
      service_type: payload.service_type,
      zone: payload.zone,
      status: payload.status,
      trust_level: payload.trust_level,
      phone: payload.phone,
      description: payload.description,
      vehicle: payload.vehicle,
      availability: payload.availability
    };

    const fallback = await client
      .from("agents")
      .insert(fallbackPayload)
      .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability")
      .single();

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(error.message);
  }

  return mapAgentRow(data);
}

export async function deleteAgent(id: string) {
  const client = getSupabaseClient();

  const { error } = await client.from("agents").delete().eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateAgentOrbit(
  id: string,
  update: { status: AgentStatus; lat?: number | null; lng?: number | null }
) {
  const client = getSupabaseClient();
  const payload: AgentUpdate = {
    status: update.status,
    lat: update.lat,
    lng: update.lng
  };

  const { data, error } = await client
    .from("agents")
    .update(payload)
    .eq("id", id)
    .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability,lat,lng,radius_km")
    .single();

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .update({ status: update.status })
      .eq("id", id)
      .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability")
      .single();

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(error.message);
  }

  return mapAgentRow(data);
}

export function getAgentInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function mapAgentRow(row: AgentRow): OrbiAgent {
  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url ?? "",
    initials: row.initials ?? getAgentInitials(row.name),
    serviceType: row.service_type,
    zone: row.zone,
    status: normalizeAgentStatus(row.status),
    trustLevel: row.trust_level,
    phone: row.phone,
    description: row.description,
    vehicle: row.vehicle ?? "",
    availability: row.availability ?? "",
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    radiusKm: typeof row.radius_km === "number" ? row.radius_km : 20
  };
}

function normalizeAgentStatus(status: AgentRow["status"]): AgentStatus {
  return status === "En órbita" ? "En órbita" : "Fuera de órbita";
}

function isMissingCoordinateColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    /lat|lng|radius_km|column|schema cache/i.test(error.message ?? "")
  );
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
