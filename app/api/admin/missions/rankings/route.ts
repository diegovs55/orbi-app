/**
 * GET /api/admin/missions/rankings
 *
 * Equivalente server-side de fetchMissionsForRankings().
 * Usa service_role — sin dependencia de sb-orbi-user.
 *
 * Replica exacta de la consulta original:
 *   supabase.from("missions")
 *     .select("selected_agent_id,selected_agent_name,business_name,requester_phone,requester_name,total_amount,status,created_at")
 *     .eq("status", "cumplida")
 *     .order("created_at", { ascending: false })
 *     .limit(500)
 *
 * Nota: el límite de 500 registros es preexistente en la función original.
 * AdminLeaders aplica filtros de período client-side sobre este conjunto.
 *
 * Retorna: { missions: ActiveMission[] }
 * Errores: 401 (sin JWT admin), 500 (error de Supabase o config)
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdminJWT, getAdmin } from "@/lib/supabase-admin";
import type { ActiveMission, MissionStatus } from "@/lib/missions";

const missionStatuses = [
  "esperando_negocio", "preparando", "por_tomar", "aceptada",
  "en_mision", "cumplida", "cancelada", "archivada",
] as const;

function normalizeMissionStatus(status: unknown): MissionStatus {
  if (missionStatuses.includes(status as MissionStatus)) return status as MissionStatus;
  return "cumplida";
}

function normalize(mission: Record<string, unknown>): ActiveMission {
  const status = normalizeMissionStatus(mission.status ?? mission.mission_status);
  const updatedAt =
    (mission.updated_at as string | undefined) ||
    (mission.last_updated_at as string | undefined) ||
    new Date().toISOString();
  return {
    ...mission,
    status,
    mission_status: undefined,
    customer_name:
      (mission.customer_name as string | undefined) ||
      (mission.requester_name as string | undefined),
    customer_phone:
      (mission.customer_phone as string | undefined) ||
      (mission.requester_phone as string | undefined),
    guest_name:
      (mission.guest_name as string | undefined) ||
      (mission.requester_name as string | undefined),
    guest_phone:
      (mission.guest_phone as string | undefined) ||
      (mission.requester_phone as string | undefined),
    total_amount:
      (mission.total_amount as number | undefined) ??
      (mission.total as number | undefined) ??
      (mission.precio_servicio as number | undefined) ??
      0,
    created_at: (mission.created_at as string | undefined) || updatedAt,
    updated_at: updatedAt,
    last_updated_at: (mission.last_updated_at as string | undefined) || updatedAt,
  } as ActiveMission;
}

export async function GET(req: NextRequest) {
  const authResult = await assertAdminJWT(req);
  if (authResult instanceof NextResponse) return authResult;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("missions")
    .select(
      "selected_agent_id,selected_agent_name,business_name,requester_phone,requester_name,total_amount,status,created_at",
    )
    .eq("status", "cumplida")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin/missions/rankings] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missions: ActiveMission[] = (data ?? []).map((r) =>
    normalize(r as Record<string, unknown>),
  );

  return NextResponse.json({ missions });
}
