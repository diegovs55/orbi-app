/**
 * POST /api/business/missions/ready
 *
 * El negocio autenticado marca el pedido listo: preparando → por_tomar.
 *
 * Mismo patrón que /api/business/missions/confirm:
 * - El navegador envía SOLO missionId.
 * - Identidad del negocio resuelta desde JWT (sb-orbi-business).
 * - Ownership verificado en servidor vía businesses.auth_user_id → businesses.name → missions.business_name.
 * - UPDATE con service_role después de autenticar, resolver y autorizar.
 * - Idempotente: si ya está en "por_tomar" y pertenece al mismo negocio → 200.
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
    .select("id,status,business_name,user_id,service_type,origin_lat,origin_lng")
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
  if ((missionRow.status as string) === "por_tomar") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // 7. Exigir estado origen correcto
  if ((missionRow.status as string) !== "preparando") {
    return NextResponse.json(
      { error: "INVALID_STATUS", detail: `status=${missionRow.status}` },
      { status: 409 }
    );
  }

  // 8. UPDATE con service_role — solo status y updated_at
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({ status: "por_tomar", updated_at: now })
    .eq("id", missionId)
    .eq("status", "preparando")
    .eq("business_name", businessName)
    .select("id,status");

  if (updateError) {
    console.error("[business/missions/ready] UPDATE error:", updateError);
    await logEvent({
      event_type: "api.business.ready.error_500",
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
    return NextResponse.json({ error: "Error al marcar el pedido como listo." }, { status: 500 });
  }

  const updated = Array.isArray(updatedRows) && updatedRows.length > 0;
  if (!updated) {
    // Condición de carrera: estado cambió entre la lectura y el UPDATE
    return NextResponse.json({ error: "MISSION_CONFLICT" }, { status: 409 });
  }

  await logEvent({
    event_type: "mission.ready_by_business",
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

  // PUSH-02 evento 3: notificar al cliente que el pedido está listo y buscando agente.
  if (missionRow.user_id) {
    const uid = missionRow.user_id as string;
    after(() => sendPushToUser(uid, {
      title: "ORBI · Pedido listo",
      body: "Tu pedido está listo. Buscando agente…",
    }));
  }

  // AGENT-PUSH-01: notificar simultáneamente a todos los agentes elegibles.
  // Misma semántica de elegibilidad que /api/missions/accept: radio efectivo = min(agente, motor_max).
  // El fallback de radius_km NULL usa motorParams.radioAsignacionMaximaKm, idéntico a /accept.
  // best-effort: un fallo de push nunca afecta la transición de estado ni la respuesta HTTP.
  after(async () => {
    console.log("[AGENT-PUSH-01] after() iniciado para misión", missionId);
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
      console.log("[AGENT-PUSH-01] agentes activos+Disponible:", rows.length, "| origin:", JSON.stringify(origin));

      const seen = new Set<string>();
      let eligibleCount = 0;
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

        const { eligible, reason } = getAgentOperatingEligibility(candidate, svcType, origin, now, mp);
        console.log("[AGENT-PUSH-01] agente", r.name, "uid", uid?.slice(0, 8), "eligible:", eligible, "reason:", reason);
        if (eligible) {
          eligibleCount++;
          console.log("[AGENT-PUSH-01] enviando push a uid", uid?.slice(0, 8));
          try {
            await sendPushToUser(uid, {
              title: "ORBI · Nuevo pedido disponible",
              body: "Hay un pedido cerca de ti. Ábrelo antes que otro agente.",
            });
            console.log("[AGENT-PUSH-01] sendPushToUser OK uid", uid?.slice(0, 8));
          } catch (pushErr) {
            console.error("[AGENT-PUSH-01] sendPushToUser THROW uid", uid?.slice(0, 8), pushErr);
          }
        }
      }
      console.log("[AGENT-PUSH-01] completado. elegibles:", eligibleCount);
    } catch (e) {
      console.error("[business/missions/ready] error en push a agentes:", e);
    }
  });

  return NextResponse.json({ ok: true });
}
