/**
 * POST /api/missions/cancel-by-agent
 *
 * El agente asignado libera una misión → regresa a por_tomar para reasignación.
 *
 * Principios (mismo patrón que /api/missions/accept):
 * - Identidad del agente resuelta desde JWT — nunca desde el body.
 * - Se verifica que el agente autenticado es el asignado a la misión.
 * - Se verifica que el estado admite cancelación (aceptada | en_mision).
 * - El UPDATE usa service_role y preserva exactamente la limpieza de cancelMissionByAgent.
 * - Idempotente: si la misión ya está por_tomar sin agente devuelve 200.
 */

import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { logEvent } from "@/lib/event-log";
import { sendPushToUser } from "@/lib/push";
import { loadMotorParams } from "@/lib/pricing/server";
import {
  getAgentOperatingEligibility,
  resolveOperationalOrigin,
  AGENT_STATUS,
  type OrbiAgent,
  type AgentServiceType,
  type AgentStatus,
} from "@/lib/agents";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANCELLABLE = ["aceptada", "en_mision"] as const;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 1. Auth: Bearer JWT
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const callerUid = authData.user.id;

  // 2. Validar body
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch {
    return NextResponse.json({ error: "JSON malformado." }, { status: 400 });
  }

  const missionId = typeof body.missionId === "string" ? body.missionId : null;
  if (!missionId || !UUID_RE.test(missionId)) {
    return NextResponse.json({ error: "missionId debe ser un UUID válido." }, { status: 400 });
  }

  // 3. Resolver agente desde auth_user_id
  const { data: agentRow, error: agentError } = await admin
    .from("agents")
    .select("id,name,admin_status")
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (agentError || !agentRow) {
    return NextResponse.json({ error: "NO_AGENT_ACCOUNT" }, { status: 403 });
  }
  const agentId = agentRow.id as string;

  // 4. Cargar misión
  const { data: missionRow, error: missionError } = await admin
    .from("missions")
    .select("id,status,selected_agent_id,service_type,origin_lat,origin_lng")
    .eq("id", missionId)
    .maybeSingle();

  if (missionError || !missionRow) {
    return NextResponse.json({ error: "MISSION_NOT_FOUND" }, { status: 404 });
  }

  // Idempotencia: ya está liberada
  if (
    (missionRow.status as string) === "por_tomar" &&
    (missionRow.selected_agent_id as string | null) == null
  ) {
    return NextResponse.json({ ok: true });
  }

  // 5. Verificar ownership
  if ((missionRow.selected_agent_id as string) !== agentId) {
    return NextResponse.json({ error: "MISSION_NOT_ASSIGNED" }, { status: 403 });
  }

  // 6. Verificar estado admite cancelación
  if (!CANCELLABLE.includes(missionRow.status as typeof CANCELLABLE[number])) {
    return NextResponse.json(
      { error: "INVALID_STATUS", detail: `status=${missionRow.status}` },
      { status: 422 }
    );
  }

  // 7. UPDATE con service_role — preserva exactamente la limpieza de cancelMissionByAgent
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({
      status: "por_tomar",
      selected_agent_id: null,
      selected_agent_name: null,
      active_agent_id: null,
      accepted_at: null,
      updated_at: now,
    })
    .eq("id", missionId)
    .eq("selected_agent_id", agentId)
    .in("status", [...CANCELLABLE])
    .select("id,status,selected_agent_id");

  if (updateError) {
    console.error("[missions/cancel-by-agent] UPDATE error:", updateError);
    await logEvent({
      event_type: "api.cancel_by_agent.error_500",
      severity: "error",
      source: "api_route",
      entity_type: "mission",
      entity_id: missionId,
      actor_type: "agent",
      actor_id: agentId,
      payload: { step: "update" },
      error_detail: updateError.message,
      http_status: 500,
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    }).catch(() => {});
    return NextResponse.json({ error: "Error al liberar la misión." }, { status: 500 });
  }

  const updated = Array.isArray(updatedRows) && updatedRows.length > 0;
  if (!updated) {
    // Condición de carrera: otro proceso modificó la misión entre la lectura y el UPDATE
    return NextResponse.json({ error: "MISSION_TAKEN" }, { status: 409 });
  }

  await logEvent({
    event_type: "mission.cancelled_by_agent",
    severity: "info",
    source: "api_route",
    entity_type: "mission",
    entity_id: missionId,
    actor_type: "agent",
    actor_id: agentId,
    payload: { agent_name: agentRow.name },
    http_status: 200,
    duration_ms: Date.now() - startedAt,
    request_id: requestId,
  }).catch(() => {});

  // AGENT-PUSH-01 reapertura: notificar a agentes elegibles que la misión volvió a por_tomar.
  // Se evalúa DESPUÉS del reset exitoso (selected_agent_id = null, status = por_tomar).
  // Misma semántica de elegibilidad que /api/missions/accept.
  // best-effort: un fallo de push nunca revierte la cancelación ni afecta la respuesta HTTP.
  after(async () => {
    try {
      const motorResult = await loadMotorParams("zumpahuacan");
      const mp = motorResult.params;
      const origin = resolveOperationalOrigin(missionRow);
      const svcType = missionRow.service_type as AgentServiceType;
      const now = new Date();

      const { data: rawRows } = await admin
        .from("agents")
        .select(
          "id,name,auth_user_id,status,is_on_orbit,availability,service_type," +
          "radius_km,lat,lng,current_lat,current_lng"
        )
        .eq("admin_status", "activo")
        .eq("status", AGENT_STATUS.ONLINE);

      const rows = (rawRows ?? []) as unknown as Record<string, unknown>[];
      const seen = new Set<string>();
      for (const r of rows) {
        const uid = r.auth_user_id as string | null;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);

        const candidate: OrbiAgent = {
          id:           r.id as string,
          authUserId:   uid,
          name:         r.name as string,
          photoUrl:     "",
          initials:     "",
          serviceType:  r.service_type as AgentServiceType,
          zone:         "",
          status:       r.status as AgentStatus,
          adminStatus:  "activo",
          isOnOrbit:    Boolean(r.is_on_orbit),
          trustLevel:   "Aprendiz",
          phone:        "",
          description:  "",
          vehicle:      "",
          availability: (r.availability as string) ?? "",
          lat:          typeof r.lat === "number" ? r.lat : null,
          lng:          typeof r.lng === "number" ? r.lng : null,
          currentLat:   typeof r.current_lat === "number" ? r.current_lat : null,
          currentLng:   typeof r.current_lng === "number" ? r.current_lng : null,
          radiusKm:     typeof r.radius_km === "number" ? r.radius_km : mp.radioAsignacionMaximaKm,
          isDemo:       false,
        };

        const { eligible } = getAgentOperatingEligibility(candidate, svcType, origin, now, mp);
        if (eligible) {
          await sendPushToUser(uid, {
            title: "ORBI · Pedido disponible nuevamente",
            body: "Un pedido cerca de ti quedó libre. Ábrelo antes que otro agente.",
          }, "agent");
        }
      }
    } catch (e) {
      console.error("[missions/cancel-by-agent] error en push a agentes:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
