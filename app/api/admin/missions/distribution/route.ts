/**
 * GET /api/admin/missions/distribution
 *
 * Equivalente server-side de fetchMissionsForDistribution().
 * Usa service_role — sin dependencia de sb-orbi-user.
 *
 * Replica exacta de la consulta original:
 *   supabase.from("missions")
 *     .select("id,status,service_type,payment_method,created_at")
 *     .neq("status", "archivada")
 *     .order("created_at", { ascending: false })
 *     .limit(1000)
 *
 * Nota: el límite de 1000 registros es preexistente en la función original.
 * AdminDistribution aplica filtros de período client-side sobre este conjunto.
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
    total_amount:
      (mission.total_amount as number | undefined) ??
      (mission.total as number | undefined) ??
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
    .select("id,status,service_type,payment_method,created_at")
    .neq("status", "archivada")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[admin/missions/distribution] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missions: ActiveMission[] = (data ?? []).map((r) =>
    normalize(r as Record<string, unknown>),
  );

  return NextResponse.json({ missions });
}
