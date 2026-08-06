/**
 * GET /api/admin/agents/list
 *
 * Equivalente server-side de getAgents().
 * Usa service_role — sin dependencia de sb-orbi-user.
 *
 * Replica exacta de la consulta original:
 *   supabase.from("agents")
 *     .select(SELECT_PUBLIC)          -- id,name,zone,status,trust_level,is_on_orbit (+ otros)
 *     .eq("admin_status", "activo")
 *     .neq("status", "Fuera de servicio")
 *     .order("status", { ascending: true })
 *     .order("name",   { ascending: true })
 *
 * La normalización de status y trustLevel es la misma que aplica fromRow()
 * en lib/agents.ts. Sin límite — igual que getAgents().
 *
 * Retorna: { agents: AgentSummary[] }
 * Errores: 401 (sin JWT admin), 500 (error de Supabase o config)
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdminJWT, getAdmin } from "@/lib/supabase-admin";

export type AgentSummary = {
  id: string;
  name: string;
  zone: string;
  // "Disponible" = AGENT_STATUS.ONLINE; "Fuera de servicio" = AGENT_STATUS.OFFLINE
  status: "Disponible" | "Fuera de servicio";
  trustLevel: "Aprendiz" | "Experto" | "Elite";
  isOnOrbit: boolean;
};

function normalizeStatus(s: string): "Disponible" | "Fuera de servicio" {
  // Mirrors fromRow() in lib/agents.ts: "Disponible" | "En órbita" → "Disponible"
  return s === "Disponible" || s === "En órbita" ? "Disponible" : "Fuera de servicio";
}

function normalizeTrustLevel(l: string): "Aprendiz" | "Experto" | "Elite" {
  if (l === "Elite" || l === "Experto" || l === "Aprendiz") return l;
  return l === "Verificado" ? "Experto" : "Aprendiz";
}

export async function GET(req: NextRequest) {
  const authResult = await assertAdminJWT(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // SELECT only the fields AdminLeaders needs — same filters as getAgents().
  // admin_status is used as a filter only; not returned (not needed by consumer).
  const { data, error } = await admin
    .from("agents")
    .select("id,name,zone,status,trust_level,is_on_orbit")
    .eq("admin_status", "activo")
    .neq("status", "Fuera de servicio")
    .order("status", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/agents/list] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agents: AgentSummary[] = (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    zone: (row.zone as string | null) ?? "—",
    status: normalizeStatus(String(row.status)),
    trustLevel: normalizeTrustLevel(String(row.trust_level)),
    isOnOrbit: (row.is_on_orbit as boolean | null) ?? false,
  }));

  return NextResponse.json({ agents });
}
