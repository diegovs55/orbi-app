import { supabase } from "@/lib/supabase";

const DELETED_AGENTS_KEY = "orbi_deleted_agent_ids";
const ORBIT_AGENTS_KEY = "orbi_on_orbit_agent_ids";

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

export type OrbiAgent = {
  id: string;
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
  status: AgentStatus | "En órbita" | "Fuera de órbita" | "Ocupado" | "Desconectado";
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
  is_on_orbit?: boolean | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

type AgentUpdate = {
  name?: string;
  photo_url?: string | null;
  initials?: string | null;
  zone?: string;
  status?: AgentStatus;
  is_on_orbit?: boolean;
  updated_at?: string;
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

type AgentOrbitUpdate = {
  status: AgentStatus;
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  serviceType?: AgentServiceType;
  availability?: string;
  operationalBaseText?: string;
  isOnOrbit?: boolean;
};

type AgentInsert = {
  name: string;
  photo_url: string | null;
  initials: string | null;
  service_type: AgentServiceType;
  zone: string;
  status: AgentStatus;
  is_on_orbit?: boolean;
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
const agentSelectWithLegacyLocationColumns = `${agentSelectMinimal},lat,lng,radius_km`;
const agentSelectWithCoreLocationColumns = `${agentSelectMinimal},lat,lng,radius_km,operational_base_lat,operational_base_lng,operational_base_text,is_on_orbit,updated_at,is_active,deleted_at`;
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

        const legacyFallback = await client
          .from("agents")
          .select(agentSelectWithLegacyLocationColumns)
          .order("status", { ascending: true })
          .order("name", { ascending: true });

        if (!legacyFallback.error) {
          return (legacyFallback.data ?? []).filter(isNotLocallyDeleted).map(mapAgentRow);
        }

        if (!isMissingCoordinateColumnError(legacyFallback.error)) {
          throw new Error(legacyFallback.error.message);
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
    is_on_orbit: agent.isOnOrbit,
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

        const legacyFallback = await client
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
            radius_km: payload.radius_km
          })
          .select(agentSelectWithLegacyLocationColumns)
          .single();

        if (!legacyFallback.error) {
          return mapAgentRow(legacyFallback.data);
        }

        if (!isMissingCoordinateColumnError(legacyFallback.error)) {
          throw new Error(legacyFallback.error.message);
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
      const inactiveFallback = await client.from("agents").update({ status: AGENT_STATUS.OFFLINE }).eq("id", id);

      if (inactiveFallback.error) {
        throw new Error(error.message);
      }
    }
  }
}

export async function updateAgentOrbit(id: string, update: AgentOrbitUpdate) {
  if (!hasValidAgentId({ id })) {
    throw new Error("Este agente no tiene id válido. Recarga la lista desde Supabase.");
  }

  const client = getSupabaseClient();
  const isTakingOrbit = update.isOnOrbit ?? update.status === AGENT_STATUS.ONLINE;
  const nextLat = update.lat ?? null;
  const nextLng = update.lng ?? null;
  const now = new Date().toISOString();
  const payload: AgentUpdate = {
    status: update.status,
    is_on_orbit: isTakingOrbit,
    updated_at: now,
    lat: isTakingOrbit ? nextLat : null,
    lng: isTakingOrbit ? nextLng : null,
    current_lat: isTakingOrbit ? nextLat : null,
    current_lng: isTakingOrbit ? nextLng : null,
    operational_base_lat: isTakingOrbit ? nextLat : undefined,
    operational_base_lng: isTakingOrbit ? nextLng : undefined,
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

  setLocalAgentOrbit(id, isTakingOrbit);

  if (isMissingCoordinateColumnError(error)) {
    const fallback = await client
      .from("agents")
      .update({
        status: update.status,
        is_on_orbit: payload.is_on_orbit,
        updated_at: payload.updated_at,
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
          is_on_orbit: payload.is_on_orbit,
          updated_at: payload.updated_at,
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

        const legacyFallback = await client
          .from("agents")
          .update({
            status: update.status,
            lat: payload.lat,
            lng: payload.lng,
            radius_km: update.radiusKm,
            service_type: update.serviceType,
            availability: update.availability || null
          })
          .eq("id", id)
          .select(agentSelectWithLegacyLocationColumns)
          .maybeSingle();

        if (!legacyFallback.error) {
          return legacyFallback.data
            ? mapAgentRow(legacyFallback.data)
            : mapAgentRow(agentOrbitToRow(id, update, payload));
        }

        if (!isMissingCoordinateColumnError(legacyFallback.error)) {
          throw new Error(legacyFallback.error.message);
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
          return mapAgentRow(agentOrbitToRow(id, update, payload));
        }

        return mapAgentRow(minimalFallback.data);
      }

      if (!coreFallback.data) {
        return mapAgentRow(agentOrbitToRow(id, update, payload));
      }

      return mapAgentRow(coreFallback.data);
    }

    if (!fallback.data) {
      return mapAgentRow(agentOrbitToRow(id, update, payload));
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(getAgentUpdateErrorMessage(error));
  }

  if (!data) {
    return mapAgentRow(agentToRow(id, {
      name: "",
      photoUrl: "",
      initials: "",
      serviceType: update.serviceType ?? "Mandados",
      zone: update.operationalBaseText ?? "Base operativa",
      status: update.status,
      isOnOrbit: isTakingOrbit,
      trustLevel: "Aprendiz",
      phone: "",
      description: "",
      vehicle: "",
      availability: update.availability ?? "",
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
      currentLat: payload.current_lat ?? null,
      currentLng: payload.current_lng ?? null,
      latitude: null,
      longitude: null,
      operationalBaseLat: payload.operational_base_lat ?? null,
      operationalBaseLng: payload.operational_base_lng ?? null,
      operationalBaseText: payload.operational_base_text ?? "Base operativa",
      radiusKm: update.radiusKm ?? 20
    }));
  }

  setLocalAgentOrbit(id, isTakingOrbit);
  return mapAgentRow(data);
}

export async function updateAgent(id: string, agent: CreateAgentInput) {
  if (!hasValidAgentId({ id })) {
    throw new Error("Este agente no tiene id válido. Recarga la lista desde Supabase.");
  }

  const client = getSupabaseClient();
  setLocalAgentOrbit(id, agent.isOnOrbit);
  const payload: AgentUpdate = {
    name: agent.name,
    photo_url: agent.photoUrl || null,
    initials: agent.initials || null,
    service_type: agent.serviceType,
    zone: agent.zone,
    status: agent.status,
    is_on_orbit: agent.isOnOrbit,
    updated_at: new Date().toISOString(),
    trust_level: agent.trustLevel,
    phone: agent.phone,
    description: agent.description,
    vehicle: agent.vehicle || null,
    availability: agent.availability || null,
    lat: agent.operationalBaseLat ?? agent.lat,
    lng: agent.operationalBaseLng ?? agent.lng,
    current_lat: agent.isOnOrbit ? agent.currentLat ?? agent.lat ?? agent.operationalBaseLat : null,
    current_lng: agent.isOnOrbit ? agent.currentLng ?? agent.lng ?? agent.operationalBaseLng : null,
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

        const legacyFallback = await client
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
            radius_km: payload.radius_km
          })
          .eq("id", id)
          .select(agentSelectWithLegacyLocationColumns)
          .maybeSingle();

        if (!legacyFallback.error) {
          return legacyFallback.data
            ? mapAgentRow(legacyFallback.data)
            : mapAgentRow(agentToRow(id, agent));
        }

        if (!isMissingCoordinateColumnError(legacyFallback.error)) {
          throw new Error(legacyFallback.error.message);
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
          return mapAgentRow(agentToRow(id, agent));
        }

        return mapAgentRow(minimalFallback.data);
      }

      if (!coreFallback.data) {
        return mapAgentRow(agentToRow(id, agent));
      }

      return mapAgentRow(coreFallback.data);
    }

    if (!fallback.data) {
      return mapAgentRow(agentToRow(id, agent));
    }

    return mapAgentRow(fallback.data);
  }

  if (error) {
    throw new Error(getAgentUpdateErrorMessage(error));
  }

  if (!data) {
    return mapAgentRow(agentToRow(id, agent));
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

export type AgentLocationDiagnostics = {
  hasValidLocation: boolean;
  location: AgentOperationalLocation | null;
  reason: string;
  fallbackWarning: string;
  checks: Array<{
    label: string;
    lat: number | null;
    lng: number | null;
    isValid: boolean;
    reason: string;
  }>;
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
      lat: agent.currentLat ?? agent.current_lat,
      lng: agent.currentLng ?? agent.current_lng,
      source: "current"
    },
    {
      lat: agent.operationalBaseLat ?? agent.operational_base_lat,
      lng: agent.operationalBaseLng ?? agent.operational_base_lng,
      source: "base"
    },
    { lat: agent.lat, lng: agent.lng, source: "legacy" },
    { lat: agent.latitude, lng: agent.longitude, source: "coordinates" }
  ];

  for (const pair of pairs) {
    const lat = toFiniteNumber(pair.lat);
    const lng = toFiniteNumber(pair.lng);

    if (isValidCoordinatePair(lat, lng)) {
      return { lat, lng: lng as number, source: pair.source };
    }
  }

  return null;
}

export function getAgentOperationalBase(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): AgentOperationalLocation | null {
  return getAgentLocationDiagnostics(agent).location;
}

export function getAgentLocationDiagnostics(
  agent: Partial<OrbiAgent> & Record<string, unknown>
): AgentLocationDiagnostics {
  const pairs: Array<{
    label: string;
    lat: unknown;
    lng: unknown;
    source: AgentOperationalLocation["source"];
  }> = [
    {
      label: "operational_base_lat/lng",
      lat: agent.operationalBaseLat ?? agent.operational_base_lat,
      lng: agent.operationalBaseLng ?? agent.operational_base_lng,
      source: "base"
    },
    {
      label: "current_lat/lng",
      lat: agent.currentLat ?? agent.current_lat,
      lng: agent.currentLng ?? agent.current_lng,
      source: "current"
    },
    { label: "lat/lng", lat: agent.lat, lng: agent.lng, source: "legacy" },
    { label: "latitude/longitude", lat: agent.latitude, lng: agent.longitude, source: "coordinates" }
  ];

  const checks: AgentLocationDiagnostics["checks"] = [];

  for (const pair of pairs) {
    const lat = toFiniteNumber(pair.lat);
    const lng = toFiniteNumber(pair.lng);
    const validation = getCoordinateValidationReason(lat, lng);

    checks.push({
      label: pair.label,
      lat,
      lng,
      isValid: validation === "válida",
      reason: validation
    });

    if (validation === "válida") {
      const location = { lat: lat as number, lng: lng as number, source: pair.source };
      const fallbackWarning =
        pair.source === "base"
          ? ""
          : `Fallback temporal usando ${pair.label}. Falta operational_base_lat/lng o viene inválido en Supabase.`;

      return {
        hasValidLocation: true,
        location,
        reason:
          pair.source === "base"
            ? "operational_base_lat/lng válido."
            : `Ubicación válida por fallback ${pair.label}.`,
        fallbackWarning,
        checks
      };
    }
  }

  return {
    hasValidLocation: false,
    location: null,
    reason: checks.map((check) => `${check.label}: ${check.reason}`).join(" · "),
    fallbackWarning: "Sin operational_base_lat/lng válido y sin fallback lat/lng utilizable.",
    checks
  };
}

export const getAgentLocation = getAgentOperationalBase;

export function getAgentCurrentLocation(agent: Partial<OrbiAgent> & Record<string, unknown>) {
  const currentLat = toFiniteNumber(agent.currentLat ?? agent.current_lat);
  const currentLng = toFiniteNumber(agent.currentLng ?? agent.current_lng);

  if (isValidCoordinatePair(currentLat, currentLng)) {
    return { lat: currentLat, lng: currentLng };
  }

  if (agent.isOnOrbit ?? agent.is_on_orbit) {
    const fallbackLat = toFiniteNumber(agent.lat);
    const fallbackLng = toFiniteNumber(agent.lng);

    if (isValidCoordinatePair(fallbackLat, fallbackLng)) {
      return { lat: fallbackLat, lng: fallbackLng };
    }
  }

  return null;
}

export function isAgentWithinOperatingHours(agent: Pick<OrbiAgent, "availability">, date = new Date()) {
  if (agent.availability.trim().toLowerCase() === "24 horas") {
    return true;
  }

  const range = getAvailabilityRange(agent.availability);

  if (!range) {
    return true;
  }

  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = timeToMinutes(range.start);
  const endMinutes = timeToMinutes(range.end);

  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

export function getAgentOperatingEligibility(agent: OrbiAgent, serviceType: AgentServiceType, origin?: { lat: number; lng: number } | null) {
  const location = getAgentLocation(agent);
  const isServiceCompatible = agent.serviceType === "Todos los servicios" || agent.serviceType === serviceType;
  const distanceKm =
    origin && location ? calculateDistanceKm(origin.lat, origin.lng, location.lat, location.lng) : null;
  const radiusKm = agent.radiusKm || 20;

  if (agent.status !== AGENT_STATUS.ONLINE) {
    return { eligible: false, reason: `fuera de servicio: ${agent.status}`, location, distanceKm };
  }

  if (!agent.isOnOrbit) {
    return { eligible: false, reason: "fuera de órbita", location, distanceKm };
  }

  if (!isAgentWithinOperatingHours(agent)) {
    return { eligible: false, reason: "fuera de horario", location, distanceKm };
  }

  if (!location) {
    return { eligible: false, reason: "sin ubicación válida", location, distanceKm };
  }

  if (!origin) {
    return { eligible: false, reason: "sin origen preciso para validar radio", location, distanceKm };
  }

  if (distanceKm !== null && distanceKm > radiusKm) {
    return { eligible: false, reason: `fuera de radio operativo: ${distanceKm.toFixed(1)} km > ${radiusKm} km`, location, distanceKm };
  }

  if (!isServiceCompatible) {
    return { eligible: false, reason: `servicio incompatible: ${agent.serviceType}`, location, distanceKm };
  }

  return { eligible: true, reason: "elegible", location, distanceKm };
}

export function getAgentOperationalLabel(
  agent: OrbiAgent,
  now = new Date(),
  origin?: { lat: number; lng: number } | null
) {
  if (agent.status !== AGENT_STATUS.ONLINE) {
    return "Fuera de servicio";
  }

  if (agent.isOnOrbit !== true) {
    return "Fuera de órbita";
  }

  if (!isAgentWithinOperatingHours(agent, now)) {
    return "Fuera de horario";
  }

  const location = getAgentLocation(agent);

  if (!location) {
    return "Fuera de órbita";
  }

  if (origin) {
    const distanceKm = calculateDistanceKm(origin.lat, origin.lng, location.lat, location.lng);
    const radiusKm = agent.radiusKm || 20;

    if (distanceKm > radiusKm) {
      return "Fuera de zona";
    }
  }

  return "En órbita";
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
    isOnOrbit: row.is_on_orbit ?? getLocalAgentOrbit(row.id),
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
    operationalBaseLat,
    operationalBaseLng,
    operationalBaseText: row.operational_base_text ?? row.zone,
    radiusKm,
    isDemo: !hasValidAgentId({ id: row.id })
  };
}

function agentToRow(id: string, agent: CreateAgentInput): AgentRow {
  return {
    id,
    name: agent.name,
    photo_url: agent.photoUrl || null,
    initials: agent.initials || getAgentInitials(agent.name),
    service_type: agent.serviceType,
    zone: agent.zone,
    status: agent.status,
    is_on_orbit: agent.isOnOrbit,
    trust_level: agent.trustLevel,
    phone: agent.phone,
    description: agent.description,
    vehicle: agent.vehicle || null,
    availability: agent.availability || null,
    lat: agent.lat,
    lng: agent.lng,
    current_lat: agent.currentLat,
    current_lng: agent.currentLng,
    latitude: agent.latitude,
    longitude: agent.longitude,
    radius_km: agent.radiusKm,
    operational_base_lat: agent.operationalBaseLat,
    operational_base_lng: agent.operationalBaseLng,
    operational_base_text: agent.operationalBaseText
  };
}

function agentOrbitToRow(id: string, update: AgentOrbitUpdate, payload: AgentUpdate): AgentRow {
  const baseText = payload.operational_base_text ?? update.operationalBaseText ?? "Base operativa";

  return {
    id,
    name: "",
    photo_url: null,
    initials: null,
    service_type: update.serviceType ?? "Mandados",
    zone: baseText,
    status: update.status,
    is_on_orbit: update.isOnOrbit ?? update.status === AGENT_STATUS.ONLINE,
    trust_level: "Aprendiz",
    phone: "",
    description: "",
    vehicle: null,
    availability: update.availability ?? null,
    lat: payload.lat,
    lng: payload.lng,
    current_lat: payload.current_lat,
    current_lng: payload.current_lng,
    radius_km: update.radiusKm ?? 20,
    operational_base_lat: payload.operational_base_lat,
    operational_base_lng: payload.operational_base_lng,
    operational_base_text: baseText
  };
}

function isValidCoordinatePair(
  lat: number | null,
  lng: number | null
): lat is number {
  return getCoordinateValidationReason(lat, lng) === "válida";
}

function getCoordinateValidationReason(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) {
    return `faltan coordenadas (${lat === null ? "lat" : ""}${lat === null && lng === null ? "/" : ""}${lng === null ? "lng" : ""})`;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "coordenadas no numéricas";
  }

  if (lat === 0 && lng === 0) {
    return "coordenadas 0,0 inválidas";
  }

  if (lat < -90 || lat > 90) {
    return `latitud fuera de rango (${lat})`;
  }

  if (lng < -180 || lng > 180) {
    return `longitud fuera de rango (${lng})`;
  }

  return "válida";
}

function isActiveAgentRow(row: AgentRow) {
  return row.deleted_at == null && row.is_active !== false;
}

function isNotLocallyDeleted(row: AgentRow) {
  return !getLocallyDeletedAgentIds().includes(row.id);
}

function getLocalAgentOrbit(id: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return getLocalOrbitAgentIds().includes(id);
}

function setLocalAgentOrbit(id: string, isOnOrbit: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  const orbitIds = new Set(getLocalOrbitAgentIds());

  if (isOnOrbit) {
    orbitIds.add(id);
  } else {
    orbitIds.delete(id);
  }

  window.localStorage.setItem(ORBIT_AGENTS_KEY, JSON.stringify(Array.from(orbitIds)));
}

function getLocalOrbitAgentIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(ORBIT_AGENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
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
  if (status === AGENT_STATUS.ONLINE || status === "En órbita") {
    return AGENT_STATUS.ONLINE;
  }

  return AGENT_STATUS.OFFLINE;
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

function getAvailabilityRange(availability: string) {
  const match = availability.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);

  if (!match) {
    return null;
  }

  return { start: match[1], end: match[2] };
}

function timeToMinutes(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function calculateDistanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
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
