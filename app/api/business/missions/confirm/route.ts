/**
 * POST /api/business/missions/confirm
 *
 * El negocio autenticado confirma un pedido: esperando_negocio → preparando.
 *
 * Principios (mismo patrón que /api/missions/accept y /api/business/update-profile):
 * - El navegador envía SOLO missionId. Nunca businessId, businessName ni email.
 * - Identidad del negocio resuelta desde JWT (sb-orbi-business) — nunca desde el body.
 * - Ownership verificado en servidor: businesses.auth_user_id → businesses.name → missions.business_name.
 * - UPDATE ejecutado con service_role únicamente después de autenticar, resolver y autorizar.
 * - Idempotente: si ya está en "preparando" y pertenece al mismo negocio → 200.
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

  // 1. Auth: Bearer JWT del negocio (supabaseBusiness)
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const callerUid = authData.user.id;

  // 2. Validar body — solo missionId es aceptado
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch {
    return NextResponse.json({ error: "JSON malformado." }, { status: 400 });
  }

  const missionId = typeof body.missionId === "string" ? body.missionId : null;
  if (!missionId || !UUID_RE.test(missionId)) {
    return NextResponse.json({ error: "missionId debe ser un UUID válido." }, { status: 400 });
  }

  // 3. Resolver negocio autenticado desde auth_user_id
  const { data: bizRow, error: bizError } = await admin
    .from("businesses")
    .select("id,name")
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (bizError || !bizRow) {
    return NextResponse.json({ error: "NO_BUSINESS_ACCOUNT" }, { status: 403 });
  }
  const businessName = bizRow.name as string;

  // 4. Cargar misión con service_role
  const { data: missionRow, error: missionError } = await admin
    .from("missions")
    .select("id,status,business_name,user_id")
    .eq("id", missionId)
    .maybeSingle();

  if (missionError || !missionRow) {
    return NextResponse.json({ error: "MISSION_NOT_FOUND" }, { status: 404 });
  }

  // 5. Verificar ownership: la misión debe pertenecer a este negocio
  if ((missionRow.business_name as string | null) !== businessName) {
    return NextResponse.json({ error: "MISSION_NOT_OWNED" }, { status: 403 });
  }

  // 6. Idempotencia: ya está en el estado destino
  if ((missionRow.status as string) === "preparando") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // 7. Exigir estado origen correcto
  if ((missionRow.status as string) !== "esperando_negocio") {
    return NextResponse.json(
      { error: "INVALID_STATUS", detail: `status=${missionRow.status}` },
      { status: 409 }
    );
  }

  // 8. UPDATE con service_role — solo status y updated_at
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({ status: "preparando", updated_at: now })
    .eq("id", missionId)
    .eq("status", "esperando_negocio")
    .eq("business_name", businessName)
    .select("id,status");

  if (updateError) {
    console.error("[business/missions/confirm] UPDATE error:", updateError);
    await logEvent({
      event_type: "api.business.confirm.error_500",
      severity: "error",
      source: "api_route",
      entity_type: "mission",
      entity_id: missionId,
      actor_type: "business",
      actor_id: bizRow.id as string,
      payload: { step: "update" },
      error_detail: updateError.message,
      http_status: 500,
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    }).catch(() => {});
    return NextResponse.json({ error: "Error al confirmar el pedido." }, { status: 500 });
  }

  const updated = Array.isArray(updatedRows) && updatedRows.length > 0;
  if (!updated) {
    // Condición de carrera: estado cambió entre la lectura y el UPDATE
    return NextResponse.json({ error: "MISSION_CONFLICT" }, { status: 409 });
  }

  await logEvent({
    event_type: "mission.confirmed_by_business",
    severity: "info",
    source: "api_route",
    entity_type: "mission",
    entity_id: missionId,
    actor_type: "business",
    actor_id: bizRow.id as string,
    payload: { business_name: businessName },
    http_status: 200,
    duration_ms: Date.now() - startedAt,
    request_id: requestId,
  }).catch(() => {});

  // PUSH-02 evento 2: notificar al cliente que el negocio confirmó su pedido.
  if (missionRow.user_id) {
    const uid = missionRow.user_id as string;
    const bName = businessName;
    after(() => sendPushToUser(uid, {
      title: "ORBI · Tu pedido fue confirmado",
      body: `${bName} está preparando tu pedido.`,
    }));
  }

  return NextResponse.json({ ok: true });
}
