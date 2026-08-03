/**
 * GET /api/admin/missions/active
 *
 * Replica exacta de fetchAllMissionsForAdmin() ejecutada con service_role.
 * Devuelve misiones en estados operativos activos, ordenadas por updated_at desc.
 * Autenticación: assertAdminJWT (Bearer token del admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdminJWT, getAdmin } from "@/lib/supabase-admin";
import type { ActiveMission, MissionStatus } from "@/lib/missions";

const ADMIN_MISSIONS_LIMIT = 100;

const missionStatuses = [
  "esperando_negocio",
  "preparando",
  "por_tomar",
  "aceptada",
  "en_mision",
  "cumplida",
  "cancelada",
  "archivada",
] as const;

function normalizeMissionStatus(status: unknown): MissionStatus {
  if (missionStatuses.includes(status as MissionStatus)) return status as MissionStatus;
  if (status === "Misión por tomar" || status === "Esperando confirmación del agente") return "por_tomar";
  if (status === "Misión aceptada") return "aceptada";
  return "por_tomar";
}

function normalize(mission: Record<string, unknown>): ActiveMission {
  const status = normalizeMissionStatus(mission.status ?? mission.mission_status);
  const updatedAt = (mission.updated_at as string | undefined) || (mission.last_updated_at as string | undefined) || new Date().toISOString();
  return {
    ...mission,
    status,
    mission_status: undefined,
    customer_name: (mission.customer_name as string | undefined) || (mission.requester_name as string | undefined),
    customer_phone: (mission.customer_phone as string | undefined) || (mission.requester_phone as string | undefined),
    guest_name: (mission.guest_name as string | undefined) || (mission.requester_name as string | undefined),
    guest_phone: (mission.guest_phone as string | undefined) || (mission.requester_phone as string | undefined),
    total_amount: (mission.total_amount as number | undefined) ?? (mission.total as number | undefined) ?? (mission.precio_servicio as number | undefined) ?? 0,
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
    .select("*")
    .in("status", ["esperando_negocio", "preparando", "por_tomar", "aceptada", "en_mision"])
    .order("updated_at", { ascending: false })
    .limit(ADMIN_MISSIONS_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missions: ActiveMission[] = (data ?? []).map((r) =>
    normalize(r as Record<string, unknown>)
  );

  return NextResponse.json(missions);
}
