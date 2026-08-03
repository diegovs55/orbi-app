/**
 * GET /api/admin/missions/history
 *
 * Replica exacta de fetchMissionHistory() ejecutada con service_role.
 * Autentica con assertAdminJWT (Bearer token de supabaseAdmin).
 * No depende de sb-orbi-user.
 *
 * Query params:
 *   page         number (default 0)
 *   serviceType  string (default "Todos" → sin filtro)
 *   status       string (default "Todos" → sin filtro)
 *   search       string (default "" → sin filtro de texto)
 *
 * Retorna: { missions: ActiveMission[], hasMore: boolean, total: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { assertAdminJWT, getAdmin } from "@/lib/supabase-admin";
import type { ActiveMission, MissionStatus } from "@/lib/missions";

const HISTORY_PAGE_SIZE = 25;

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

  const { searchParams } = new URL(req.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const serviceType = searchParams.get("serviceType") ?? "Todos";
  const status = searchParams.get("status") ?? "Todos";
  const search = (searchParams.get("search") ?? "").trim();

  let query = admin
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

  if (search) {
    const lower = search
      .replace(/folio:/gi, "")
      .replace(/#/g, "")
      .trim()
      .toLowerCase();

    if (lower) {
      const isFolioTerm = /^[0-9a-f]{4,12}$/.test(lower);
      if (!isFolioTerm) {
        query = query.or(
          `requester_name.ilike.%${lower}%,selected_agent_name.ilike.%${lower}%,service_type.ilike.%${lower}%`
        );
      }
      // Folio terms: no server filter — UUID column ilike is unreliable.
      // The component's client filter matches visible rows by m.id suffix.
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[admin/missions/history] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const missions: ActiveMission[] = (data ?? []).map((r) =>
    normalize(r as Record<string, unknown>)
  );
  const total = count ?? 0;
  const hasMore = (page + 1) * HISTORY_PAGE_SIZE < total;

  return NextResponse.json({ missions, hasMore, total });
}
