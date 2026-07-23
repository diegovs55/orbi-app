/**
 * POST /api/missions/accept
 *
 * Acepta atómicamente una misión abierta (selected_agent_id IS NULL, status = 'por_tomar').
 * El primer agente elegible que llama este endpoint queda asignado.
 *
 * Principios:
 * - La identidad del agente se resuelve exclusivamente desde el JWT — nunca desde el body.
 * - La elegibilidad se valida server-side: radio efectivo, servicio, órbita, horario, GPS.
 * - El UPDATE usa tres guardas: id = missionId AND status = 'por_tomar' AND selected_agent_id IS NULL.
 *   Si otro agente ganó la carrera, el UPDATE afecta 0 filas → 409 MISSION_TAKEN.
 * - El event_log es best-effort: un fallo de log no revierte una aceptación válida.
 * - No se escriben selected_agent_vehicle ni selected_agent_trust (columnas inexistentes en DB).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { logEvent } from "@/lib/event-log";
import { loadMotorParams } from "@/lib/pricing/server";
import {
  getAgentOperationalLocation,
  isAgentWithinOperatingHours,
  AGENT_STATUS,
  calcHaversineKm,
  resolveOperationalOrigin,
  type MissionOrigin,
} from "@/lib/agents";

// ── Códigos de error canónicos ────────────────────────────────────────────────

const ERR = {
  UNAUTHORIZED:        { code: "UNAUTHORIZED",        status: 401 },
  NO_AGENT_ACCOUNT:    { code: "NO_AGENT_ACCOUNT",    status: 403 },
  MISSION_NOT_FOUND:   { code: "MISSION_NOT_FOUND",   status: 404 },
  AGENT_NOT_ELIGIBLE:  { code: "AGENT_NOT_ELIGIBLE",  status: 422 },
  OUTSIDE_RADIUS:      { code: "OUTSIDE_RADIUS",      status: 422 },
  SERVICE_INCOMPATIBLE:{ code: "SERVICE_INCOMPATIBLE",status: 422 },
  MISSION_TAKEN:       { code: "MISSION_TAKEN",       status: 409 },
} as const;

function err(key: keyof typeof ERR, detail?: string) {
  const { code, status } = ERR[key];
  return NextResponse.json({ error: code, detail: detail ?? code }, { status });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt  = Date.now();
  const requestId  = crypto.randomUUID();

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 1. Auth: JWT Bearer obligatorio — identidad desde Supabase Auth, nunca desde el body
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return err("UNAUTHORIZED");

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return err("UNAUTHORIZED");
  const callerUid = authData.user.id;

  // 2. Validar body — solo mission_id; cualquier otro campo del body se ignora
  // D1: UUID canónico validado antes de llegar a PostgREST — 8-4-4-4-12 hex, case-insensitive.
  //     Los IDs de missions son UUID generados por Postgres (no necesariamente v4),
  //     por lo que se valida el formato canónico sin restringir la versión.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch {
    return NextResponse.json(
      { error: "Solicitud inválida.", code: "INVALID_REQUEST", detail: "JSON malformado." },
      { status: 400 }
    );
  }

  const mission_id = typeof body.mission_id === "string" ? body.mission_id : null;
  if (!mission_id || !UUID_RE.test(mission_id)) {
    return NextResponse.json(
      { error: "Solicitud inválida.", code: "INVALID_REQUEST", detail: "mission_id debe ser un UUID válido." },
      { status: 400 }
    );
  }
  // agent_id u otros campos del body no se leen en ningún punto posterior

  // 3. Resolver agente desde auth_user_id — sin confiar en agent_id del cliente
  const { data: agentRow, error: agentError } = await admin
    .from("agents")
    .select("id,name,zone,status,is_on_orbit,availability,service_type,radius_km,lat,lng,current_lat,current_lng")
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (agentError || !agentRow) return err("NO_AGENT_ACCOUNT");
  const agentId = agentRow.id as string;

  // 4. Cargar misión
  const { data: missionRow, error: missionError } = await admin
    .from("missions")
    .select("id,status,selected_agent_id,service_type,origin_lat,origin_lng,business_id,origin_text")
    .eq("id", mission_id)
    .maybeSingle();

  if (missionError || !missionRow) return err("MISSION_NOT_FOUND");

  // 5. Cargar motor_params — D2: capturado; en prod lanza si la tabla está vacía o falla
  // No exponer detalle interno al cliente.
  let motorParams: Awaited<ReturnType<typeof loadMotorParams>>["params"];
  try {
    const result = await loadMotorParams("zumpahuacan");
    motorParams = result.params;
  } catch (e) {
    console.error("[missions/accept] motor_params no disponibles:", e);
    return NextResponse.json(
      { error: "Error interno.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }

  // 6. Resolver origen operativo según service_type de la misión
  const origin: MissionOrigin = resolveOperationalOrigin(missionRow);

  // 7. Posición del agente: current_lat/lng primero, lat/lng como fallback
  // getAgentOperationalLocation usa camelCase; mapeamos desde snake_case del DB row.
  const agentLocation = getAgentOperationalLocation({
    currentLat: agentRow.current_lat as number | null,
    currentLng: agentRow.current_lng as number | null,
    lat:        agentRow.lat        as number | null,
    lng:        agentRow.lng        as number | null,
  });

  // 8. Elegibilidad server-side
  const agentStatus = agentRow.status as string;
  if (agentStatus !== AGENT_STATUS.ONLINE) {
    return err("AGENT_NOT_ELIGIBLE", `status=${agentStatus}`);
  }
  if (!agentRow.is_on_orbit) {
    return err("AGENT_NOT_ELIGIBLE", "fuera de órbita");
  }
  if (!isAgentWithinOperatingHours({ availability: (agentRow.availability as string) ?? "" })) {
    return err("AGENT_NOT_ELIGIBLE", "fuera de horario");
  }
  if (!agentLocation) {
    return err("AGENT_NOT_ELIGIBLE", "sin ubicación GPS válida");
  }

  // 9. Radio efectivo — la autoridad del máximo es motorParams; nunca un valor hardcodeado.
  //    Si el agente no tiene radius_km configurado, se usa motorParams.radioAsignacionMaximaKm como techo.
  const agentRadiusKm   = typeof agentRow.radius_km === "number" ? agentRow.radius_km : motorParams.radioAsignacionMaximaKm;
  const effectiveRadius = Math.min(agentRadiusKm, motorParams.radioAsignacionMaximaKm);

  // 10. Compatibilidad de servicio
  const agentServiceType = agentRow.service_type as string;
  const missionServiceType = missionRow.service_type as string;
  if (agentServiceType !== "Todos los servicios" && agentServiceType !== missionServiceType) {
    return err("SERVICE_INCOMPATIBLE", `agente=${agentServiceType} misión=${missionServiceType}`);
  }

  // 11. Distancia agente → origen (Haversine — exclusivo para selección de agentes)
  if (origin) {
    const distanceKm = calcHaversineKm(
      agentLocation.lat, agentLocation.lng,
      origin.lat, origin.lng
    );
    if (distanceKm > effectiveRadius) {
      return err("OUTSIDE_RADIUS", `${distanceKm.toFixed(2)} km > radio efectivo ${effectiveRadius} km`);
    }
  }

  // 12. UPDATE atómico — una sola operación con tres guardas
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({
      status:              "aceptada",
      selected_agent_id:   agentId,
      selected_agent_name: agentRow.name,
      selected_agent_zone: (agentRow.zone as string | null) ?? null,
      selected_agent_lat:  agentLocation.lat,
      selected_agent_lng:  agentLocation.lng,
      active_agent_id:     agentId,
      accepted_at:         now,
      updated_at:          now,
      // selected_agent_vehicle → no existe en DB
      // selected_agent_trust   → no existe en DB
    })
    .eq("id", mission_id)
    .eq("status", "por_tomar")
    .is("selected_agent_id", null)   // guarda atómico central
    .select("id");

  if (updateError) {
    console.error("[missions/accept] UPDATE error:", updateError);
    await logEvent({
      event_type:  "api.accept.error_500",
      severity:    "error",
      source:      "api_route",
      entity_type: "mission",
      entity_id:   mission_id,
      actor_type:  "agent",
      actor_id:    agentId,
      payload:     { step: "atomic_update" },
      error_detail: updateError.message,
      http_status: 500,
      duration_ms: Date.now() - startedAt,
      request_id:  requestId,
    }).catch(() => {});
    return NextResponse.json({ error: "Error al aceptar la misión." }, { status: 500 });
  }

  const accepted = Array.isArray(updatedRows) && updatedRows.length > 0;

  if (!accepted) {
    // 0 filas afectadas: la misión ya fue tomada o no cumplía las guardas
    await logEvent({
      event_type:  "api.accept.mission_taken",
      severity:    "info",
      source:      "api_route",
      entity_type: "mission",
      entity_id:   mission_id,
      actor_type:  "agent",
      actor_id:    agentId,
      payload:     { result: "race_lost" },
      http_status: 409,
      duration_ms: Date.now() - startedAt,
      request_id:  requestId,
    }).catch(() => {});
    return err("MISSION_TAKEN");
  }

  // 13. Log de éxito — best-effort, nunca revierte la aceptación
  await logEvent({
    event_type:  "mission.accepted",
    severity:    "info",
    source:      "api_route",
    entity_type: "mission",
    entity_id:   mission_id,
    actor_type:  "agent",
    actor_id:    agentId,
    payload:     {
      agent_name:       agentRow.name,
      agent_zone:       agentRow.zone,
      effective_radius: effectiveRadius,
      agent_radius_km:  agentRadiusKm,
      motor_max_km:     motorParams.radioAsignacionMaximaKm,
      agent_lat:        agentLocation.lat,
      agent_lng:        agentLocation.lng,
      origin_source:    origin?.source ?? null,
    },
    http_status: 200,
    duration_ms: Date.now() - startedAt,
    request_id:  requestId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, mission_id, agent_id: agentId });
}
