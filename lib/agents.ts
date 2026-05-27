import { supabase } from "@/lib/supabase";

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

export type AgentStatus = "En órbita" | "Fuera de órbita";

export const agentLevels = ["Aprendiz", "Experto", "Elite"] as const;

export type AgentTrustLevel = (typeof agentLevels)[number];

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
  currentLat: number | null;
  currentLng: number | null;
  latitude: number | null;
  longitude: number | null;
  operationalBaseLat: number | null;
  operationalBaseLng: number | null;
  operationalBaseText: string;
  radiusKm: number;
  isDemo?: boolean;
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
  trust_level: AgentTrustLevel | "Verificado" | "En validación";
  phone: string;
  description: string;
  vehicle: string | null;
  availability: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  current_lat?: number | string | null;
  current_lng?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  radius_km?: number | string | null;
  operational_base_lat?: number | string | null;
  operational_base_lng?: number | string | null;
  operational_base_text?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type AgentUpdate = {
  name?: string;
  photo_url?: string | null;
  initials?: string | null;
  zone?: string;
  status?: AgentStatus;
  lat?: number | null;
  lng?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  operational_base_lat?: number | null;
  operational_base_lng?: number | null;
  operational_base_text?: string | null;
  radius_km?: number | null;
  service_type?: AgentServiceType;
  availability?: string | null;
  trust_level?: AgentTrustLevel;
  phone?: string;
  description?: string;
  vehicle?: string | null;
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
  current_lat?: number | null;
  current_lng?: number | null;
  radius_km?: number | null;
  operational_base_lat?: number | null;
  operational_base_lng?: number | null;
  operational_base_text?: string | null;
};

const agentSelectMinimal =
  "id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability";
const agentSelectWithCoreLocationColumns = `${agentSelectMinimal},lat,lng,radius_km,operational_base_lat,operational_base_lng,operational_base_text,is_active,deleted_at`;
const agentSelectWithCurrentLocationColumns = `${agentSelectWithCoreLocationColumns},current_lat,current_lng`;
const agentSelectWithAllLocationColumns = `${agentSelectWithCurrentLocationColumns},latitude,longitude`;

export async function getAgents() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("agents")
    .select(agentSelectWithAllLocationColumns)
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .select(agentSelectWithCurrentLocationColumns)
      .order("status", { ascending: true })
      .order("name", { ascending: true });

    if (fallback.error) {
      if (!isMissingCoordinateColumnError(fallback.error)) {
        throw new Error(fallback.error.message);
      }

      const coreFallback = await client
        .from("agents")
        .select(agentSelectWithCoreLocationColumns)
        .order("status", { ascending: true })
        .order("name", { ascending: true });

      if (coreFallback.error) {
        if (!isMissingCoordinateColumnError(coreFallback.error)) {
          throw new Error(coreFallback.error.message);
        }

        const minimalFallback = await client
          .from("agents")
          .select(agentSelectMinimal)
          .order("status", { ascending: true })
          .order("name", { ascending: true });

        if (minimalFallback.error) {
          throw new Error(minimalFallback.error.message);
        }

        return (minimalFallback.data ?? []).filter(isNotLocallyDeleted).map(mapAgentRow);
      }

      return (coreFallback.data ?? []).filter(isActiveAgentRow).filter(isNotLocallyDeleted).map(mapAgentRow);
    }

    return (fallback.data ?? []).filter(isActiveAgentRow).filter(isNotLocallyDeleted).map(mapAgentRow);
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).filter(isActiveAgentRow).filter(isNotLocallyDeleted).map(mapAgentRow);
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
    current_lat: agent.currentLat ?? agent.lat ?? agent.operationalBaseLat,
    current_lng: agent.currentLng ?? agent.lng ?? agent.operationalBaseLng,
    operational_base_lat: agent.operationalBaseLat ?? agent.lat,
    operational_base_lng: agent.operationalBaseLng ?? agent.lng,
    operational_base_text: agent.operationalBaseText || agent.zone,
    radius_km: agent.radiusKm || 20
  };

  const { data, error } = await client
    .from("agents")
    .insert(payload)
    .select(agentSelectWithAllLocationColumns)
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
      availability: payload.availability,
      lat: payload.lat,
      lng: payload.lng,
      current_lat: payload.current_lat,
      current_lng: payload.current_lng,
      operational_base_lat: payload.operational_base_lat,
      operational_base_lng: payload.operational_base_lng,
      operational_base_text: payload.operational_base_text,
      radius_km: payload.radius_km
    };

    const fallback = await client
      .from("agents")
      .insert(fallbackPayload)
      .select(agentSelectWithCurrentLocationColumns)
      .single();

    if (fallback.error) {
      if (!isMissingCoordinateColumnError(fallback.error)) {
        throw new Error(fallback.error.message);
      }

      const coreFallback = await client
        .from("agents")
        .insert({
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
          availability: payload.availability,
          lat: payload.lat,
          lng: payload.lng,
          operational_base_lat: payload.operational_base_lat,
          operational_base_lng: payload.operational_base_lng,
          operational_base_text: payload.operational_base_text,
          radius_km: payload.radius_km
        })
        .select(agentSelectWithCoreLocationColumns)
        .single();

      if (coreFallback.error) {
        if (!isMissingCoordinateColumnError(coreFallback.error)) {
          throw new Error(coreFallback.error.message);
        }

        const minimalFallback = await client
          .from("agents")
          .insert({
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
          })
          .select(agentSelectMinimal)
          .single();

        if (minimalFallback.error) {
          throw new Error(minimalFallback.error.message);
        }

        return mapAgentRow(minimalFallback.data);
      }

      return mapAgentRow(coreFallback.data);
    }

    if (!fallback.data) {
      throw new Error("No fue posible guardar el agente en Supabase.");
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(error.message);
  }

  return mapAgentRow(data);
}

export async function deleteAgent(id: string) {
  if (!hasValidAgentId({ id })) {
    throw new Error("Este agente no tiene id válido. Recarga la lista desde Supabase.");
  }

  const client = getSupabaseClient();
  markAgentDeletedLocally(id);

  const { error } = await client.from("agents").delete().eq("id", id);

  if (error) {
    const softDelete = await client
      .from("agents")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (softDelete.error) {
      const inactiveFallback = await client.from("agents").update({ status: "Fuera de órbita" }).eq("id", id);

      if (inactiveFallback.error) {
        throw new Error(error.message);
      }
    }
  }
}

export async function updateAgentOrbit(
  id: string,
  update: {
    status: AgentStatus;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number;
    serviceType?: AgentServiceType;
    availability?: string;
    operationalBaseText?: string;
  }
) {
  if (!hasValidAgentId({ id })) {
    throw new Error("Este agente no tiene id válido. Recarga la lista desde Supabase.");
  }

  const client = getSupabaseClient();
  const nextLat = update.lat ?? null;
  const nextLng = update.lng ?? null;
  const payload: AgentUpdate = {
    status: update.status,
    lat: nextLat,
    lng: nextLng,
    current_lat: nextLat,
    current_lng: nextLng,
    operational_base_lat: nextLat,
    operational_base_lng: nextLng,
    operational_base_text: update.operationalBaseText ?? "Ubicación actual del agente",
    radius_km: update.radiusKm,
    service_type: update.serviceType,
    availability: update.availability || null
  };

  const { data, error } = await client
    .from("agents")
    .update(payload)
    .eq("id", id)
    .select(agentSelectWithAllLocationColumns)
    .maybeSingle();

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .update({
        status: update.status,
        lat: payload.lat,
        lng: payload.lng,
        current_lat: payload.current_lat,
        current_lng: payload.current_lng,
        operational_base_lat: payload.operational_base_lat,
        operational_base_lng: payload.operational_base_lng,
        operational_base_text: payload.operational_base_text,
        radius_km: update.radiusKm,
        service_type: update.serviceType,
        availability: update.availability || null
      })
      .eq("id", id)
      .select(agentSelectWithCurrentLocationColumns)
      .maybeSingle();

    if (fallback.error) {
      if (!isMissingCoordinateColumnError(fallback.error)) {
        throw new Error(fallback.error.message);
      }

      const coreFallback = await client
        .from("agents")
        .update({
          status: update.status,
          lat: payload.lat,
          lng: payload.lng,
          operational_base_lat: payload.operational_base_lat,
          operational_base_lng: payload.operational_base_lng,
          operational_base_text: payload.operational_base_text,
          radius_km: update.radiusKm,
          service_type: update.serviceType,
          availability: update.availability || null
        })
        .eq("id", id)
        .select(agentSelectWithCoreLocationColumns)
        .maybeSingle();

      if (coreFallback.error) {
        if (!isMissingCoordinateColumnError(coreFallback.error)) {
          throw new Error(coreFallback.error.message);
        }

        const minimalFallback = await client
          .from("agents")
          .update({
            status: update.status,
            service_type: update.serviceType,
            availability: update.availability || null
          })
          .eq("id", id)
          .select(agentSelectMinimal)
          .maybeSingle();

        if (minimalFallback.error) {
          throw new Error(minimalFallback.error.message);
        }

        if (!minimalFallback.data) {
          throw new Error("No se encontró el agente en Supabase. Recarga la página.");
        }

        return mapAgentRow(minimalFallback.data);
      }

      if (!coreFallback.data) {
        throw new Error("No se encontró el agente en Supabase. Recarga la página.");
      }

      return mapAgentRow(coreFallback.data);
    }

    if (!fallback.data) {
      throw new Error("No se encontró el agente en Supabase. Recarga la página.");
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(getAgentUpdateErrorMessage(error));
  }

  if (!data) {
    throw new Error("No se encontró el agente en Supabase. Recarga la página.");
  }

  return mapAgentRow(data);
}

export async function updateAgent(id: string, agent: CreateAgentInput) {
  if (!hasValidAgentId({ id })) {
    throw new Error("Este agente no tiene id válido. Recarga la lista desde Supabase.");
  }

  const client = getSupabaseClient();
  const payload: AgentUpdate = {
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
    current_lat: agent.currentLat ?? agent.lat ?? agent.operationalBaseLat,
    current_lng: agent.currentLng ?? agent.lng ?? agent.operationalBaseLng,
    operational_base_lat: agent.operationalBaseLat ?? agent.lat,
    operational_base_lng: agent.operationalBaseLng ?? agent.lng,
    operational_base_text: agent.operationalBaseText || agent.zone,
    radius_km: agent.radiusKm
  };

  const { data, error } = await client
    .from("agents")
    .update(payload)
    .eq("id", id)
    .select(agentSelectWithAllLocationColumns)
    .maybeSingle();

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .update({
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
        availability: payload.availability,
        lat: payload.lat,
        lng: payload.lng,
        current_lat: payload.current_lat,
        current_lng: payload.current_lng,
        operational_base_lat: payload.operational_base_lat,
        operational_base_lng: payload.operational_base_lng,
        operational_base_text: payload.operational_base_text,
        radius_km: payload.radius_km
      })
      .eq("id", id)
      .select(agentSelectWithCurrentLocationColumns)
      .maybeSingle();

    if (fallback.error) {
      if (!isMissingCoordinateColumnError(fallback.error)) {
        throw new Error(fallback.error.message);
      }

      const coreFallback = await client
        .from("agents")
        .update({
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
          availability: payload.availability,
          lat: payload.lat,
          lng: payload.lng,
          operational_base_lat: payload.operational_base_lat,
          operational_base_lng: payload.operational_base_lng,
          operational_base_text: payload.operational_base_text,
          radius_km: payload.radius_km
        })
        .eq("id", id)
        .select(agentSelectWithCoreLocationColumns)
        .maybeSingle();

      if (coreFallback.error) {
        if (!isMissingCoordinateColumnError(coreFallback.error)) {
          throw new Error(coreFallback.error.message);
        }

        const minimalFallback = await client
          .from("agents")
          .update({
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
          })
          .eq("id", id)
          .select(agentSelectMinimal)
          .maybeSingle();

        if (minimalFallback.error) {
          throw new Error(minimalFallback.error.message);
        }

        if (!minimalFallback.data) {
          throw new Error("No se encontró el agente en Supabase. Recarga la página.");
        }

        return mapAgentRow(minimalFallback.data);
      }

      if (!coreFallback.data) {
        throw new Error("No se encontró el agente en Supabase. Recarga la página.");
      }

      return mapAgentRow(coreFallback.data);
    }

    if (!fallback.data) {
      throw new Error("No se encontró el agente en Supabase. Recarga la página.");
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(getAgentUpdateErrorMessage(error));
  }

  if (!data) {
    throw new Error("No se encontró el agente en Supabase. Recarga la página.");
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

export type AgentOperationalLocation = {
  lat: number;
  lng: number;
  source: "base" | "current" | "legacy" | "coordinates";
};

export function getAgentOperationalLocation(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): AgentOperationalLocation | null {
  const pairs: Array<{
    lat: unknown;
    lng: unknown;
    source: AgentOperationalLocation["source"];
  }> = [
    {
      lat: agent.operationalBaseLat ?? agent.operational_base_lat,
      lng: agent.operationalBaseLng ?? agent.operational_base_lng,
      source: "base"
    },
    {
      lat: agent.currentLat ?? agent.current_lat,
      lng: agent.currentLng ?? agent.current_lng,
      source: "current"
    },
    { lat: agent.lat, lng: agent.lng, source: "legacy" },
    { lat: agent.latitude, lng: agent.longitude, source: "coordinates" }
  ];

  for (const pair of pairs) {
    const lat = toFiniteNumber(pair.lat);
    const lng = toFiniteNumber(pair.lng);

    if (lat !== null && lng !== null) {
      return { lat, lng, source: pair.source };
    }
  }

  return null;
}

export function hasValidAgentId(agent: Pick<OrbiAgent, "id"> | { id?: unknown }) {
  const id = typeof agent.id === "string" ? agent.id.trim() : "";

  return Boolean(id) && !/^(demo|mock|local|temp)[-_]/i.test(id);
}

function mapAgentRow(row: AgentRow): OrbiAgent {
  const lat = toFiniteNumber(row.lat);
  const lng = toFiniteNumber(row.lng);
  const currentLat = toFiniteNumber(row.current_lat);
  const currentLng = toFiniteNumber(row.current_lng);
  const latitude = toFiniteNumber(row.latitude);
  const longitude = toFiniteNumber(row.longitude);
  const operationalBaseLat = toFiniteNumber(row.operational_base_lat);
  const operationalBaseLng = toFiniteNumber(row.operational_base_lng);
  const radiusKm = toFiniteNumber(row.radius_km) ?? 20;
  const operationalLocation = getAgentOperationalLocation({
    operationalBaseLat,
    operationalBaseLng,
    currentLat,
    currentLng,
    lat,
    lng,
    latitude,
    longitude
  });

  return {
    id: row.id,
    name: row.name,
    photoUrl: row.photo_url ?? "",
    initials: row.initials ?? getAgentInitials(row.name),
    serviceType: row.service_type,
    zone: row.zone,
    status: normalizeAgentStatus(row.status),
    trustLevel: normalizeAgentLevel(row.trust_level),
    phone: row.phone,
    description: row.description,
    vehicle: row.vehicle ?? "",
    availability: row.availability ?? "",
    lat,
    lng,
    currentLat,
    currentLng,
    latitude,
    longitude,
    operationalBaseLat: operationalBaseLat ?? operationalLocation?.lat ?? null,
    operationalBaseLng: operationalBaseLng ?? operationalLocation?.lng ?? null,
    operationalBaseText: row.operational_base_text ?? row.zone,
    radiusKm,
    isDemo: !hasValidAgentId({ id: row.id })
  };
}

function isActiveAgentRow(row: AgentRow) {
  return row.deleted_at == null && row.is_active !== false;
}

function isNotLocallyDeleted(row: AgentRow) {
  return !getLocallyDeletedAgentIds().includes(row.id);
}

function markAgentDeletedLocally(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  const deletedIds = new Set(getLocallyDeletedAgentIds());
  deletedIds.add(id);
  window.localStorage.setItem(DELETED_AGENTS_KEY, JSON.stringify(Array.from(deletedIds)));
}

function getLocallyDeletedAgentIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(DELETED_AGENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function normalizeAgentStatus(status: AgentRow["status"]): AgentStatus {
  return status === "En órbita" ? "En órbita" : "Fuera de órbita";
}

function normalizeAgentLevel(level: AgentRow["trust_level"]): AgentTrustLevel {
  if (level === "Elite" || level === "Experto" || level === "Aprendiz") {
    return level;
  }

  return level === "Verificado" ? "Experto" : "Aprendiz";
}

function isMissingCoordinateColumnError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42703" ||
    /lat|lng|latitude|longitude|radius_km|operational_base|current_|is_active|deleted_at|column|schema cache/i.test(error.message ?? "")
  );
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numberValue = Number(value.trim());
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
}

function getAgentUpdateErrorMessage(error: { message?: string; code?: string }) {
  const message = error.message ?? "No fue posible actualizar el agente.";

  if (/multiple|single json object|coerce/i.test(message)) {
    return "Supabase devolvió más de un registro al actualizar el agente. Revisa que el filtro sea por id único.";
  }

  return message;
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
