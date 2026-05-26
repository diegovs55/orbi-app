import { supabase } from "@/lib/supabase";

export const agentServiceTypes = [
  "Mandados",
  "Entregas",
  "Traslados",
  "Compras",
  "Recolecciones"
] as const;

export type AgentServiceType = (typeof agentServiceTypes)[number];

export type AgentStatus = "Disponible" | "Ocupado" | "Fuera de servicio";

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
};

export type CreateAgentInput = Omit<OrbiAgent, "id">;

type AgentRow = {
  id: string;
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
};

export async function getAgents() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("agents")
    .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

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
    availability: agent.availability || null
  };

  const { data, error } = await client
    .from("agents")
    .insert(payload)
    .select("id,name,photo_url,initials,service_type,zone,status,trust_level,phone,description,vehicle,availability")
    .single();

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
    status: row.status,
    trustLevel: row.trust_level,
    phone: row.phone,
    description: row.description,
    vehicle: row.vehicle ?? "",
    availability: row.availability ?? ""
  };
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return supabase;
}
