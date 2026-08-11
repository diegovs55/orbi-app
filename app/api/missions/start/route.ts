/**
 * POST /api/missions/start
 *
 * Transición aceptada → en_mision iniciada por el agente asignado.
 *
 * Principios (mismo patrón que /api/missions/accept):
 * - La identidad del agente se resuelve desde el JWT — nunca desde el body.
 * - Se verifica que el agente autenticado es el asignado a la misión.
 * - Se verifica que el estado actual es "aceptada".
 * - El UPDATE usa service_role.
 * - Idempotente: si la misión ya está en_mision devuelve 200.
 */

import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { logEvent } from "@/lib/event-log";
import { sendPushToUser } from "@/lib/push";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 1. Auth: Bearer JWT — identidad desde Supabase Auth
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
  if ((agentRow.admin_status as string | null) === "desactivado") {
    return NextResponse.json({ error: "AGENT_NOT_ELIGIBLE" }, { status: 422 });
  }
  const agentId = agentRow.id as string;

  // 4. Cargar misión
  const { data: missionRow, error: missionError } = await admin
    .from("missions")
    .select("id,status,selected_agent_id,user_id")
    .eq("id", missionId)
    .maybeSingle();

  if (missionError || !missionRow) {
    return NextResponse.json({ error: "MISSION_NOT_FOUND" }, { status: 404 });
  }

  // Idempotencia: ya está en el estado destino
  if ((missionRow.status as string) === "en_mision") {
    if ((missionRow.selected_agent_id as string) !== agentId) {
      return NextResponse.json({ error: "MISSION_TAKEN" }, { status: 409 });
    }
    const { data: fresh } = await admin.from("missions").select("*").eq("id", missionId).maybeSingle();
    return NextResponse.json({ ok: true, mission: fresh });
  }

  // 5. Verificar estado y ownership
  if ((missionRow.status as string) !== "aceptada") {
    return NextResponse.json({ error: "INVALID_STATUS", detail: `status=${missionRow.status}` }, { status: 422 });
  }
  if ((missionRow.selected_agent_id as string) !== agentId) {
    return NextResponse.json({ error: "MISSION_NOT_ASSIGNED" }, { status: 403 });
  }

  // 6. UPDATE con service_role
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({ status: "en_mision", updated_at: now })
    .eq("id", missionId)
    .eq("status", "aceptada")
    .eq("selected_agent_id", agentId)
    .select("*");

  if (updateError) {
    console.error("[missions/start] UPDATE error:", updateError);
    await logEvent({
      event_type: "api.start.error_500",
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
    return NextResponse.json({ error: "Error al iniciar la misión." }, { status: 500 });
  }

  const updated = Array.isArray(updatedRows) && updatedRows.length > 0;
  if (!updated) {
    return NextResponse.json({ error: "MISSION_TAKEN" }, { status: 409 });
  }

  await logEvent({
    event_type: "mission.started",
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

  // PUSH-02 evento 5: notificar al cliente que el agente inició ruta (aceptada → en_mision).
  if (missionRow.user_id) {
    const uid = missionRow.user_id as string;
    const agentName = agentRow.name as string;
    after(() => sendPushToUser(uid, {
      title: "ORBI · Agente en camino",
      body: `${agentName} ya va en camino para atender tu misión.`,
    }));
  }

  return NextResponse.json({ ok: true, mission: updatedRows[0] });
}
