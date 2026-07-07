/**
 * POST /api/missions/complete
 *
 * Cierra una misión (status → 'cumplida') y escribe los movimientos
 * contables en public.ledger_entries.
 *
 * Principios:
 * - Idempotente: si ya existen entradas en ledger para este mission_id,
 *   no se duplican. Se puede llamar dos veces con seguridad.
 * - Desacoplado: la lógica de ledger está en lib/ledger.ts. Agregar un
 *   proveedor de pago (Stripe, Mercado Pago, etc.) solo requiere llamar
 *   a ese proveedor antes de insert_ledger, sin tocar esta estructura.
 * - Seguro: usa SERVICE_ROLE_KEY para bypasear RLS (solo server-side).
 *
 * Orden de operaciones:
 *   1. Validar parámetros.
 *   2. Verificar idempotencia (ledger ya existe → return ok sin duplicar).
 *   3. UPDATE missions SET status='cumplida' (guard: solo si está 'en_mision').
 *   4. Leer misión completa con todos los campos financieros.
 *   5. Generar los movimientos con generarMovimientosMision().
 *   6. INSERT todos los movimientos en un solo batch (atómico en Postgres).
 *   7. Retornar la misión completada.
 *
 * Si el INSERT del ledger falla tras el UPDATE, la misión sigue 'cumplida'
 * (estado correcto para el usuario) y el endpoint es retriable: la próxima
 * llamada salta el UPDATE (ya está 'cumplida') y solo hace el INSERT.
 */

import { NextRequest, NextResponse } from "next/server";
import { generarMovimientosMision, assertLedgerBalance, validateMissionIds } from "@/lib/ledger";
import type { ActiveMission } from "@/lib/missions";
import { logEvent } from "@/lib/event-log";
import { getAdmin } from "@/lib/supabase-admin";

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 0. Autenticación del agente — JWT Bearer obligatorio
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const callerUid = authData.user.id;

  // 1. Validar entrada
  let body: { mission_id?: string; agent_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { mission_id, agent_id } = body;
  if (!mission_id || !agent_id) {
    return NextResponse.json({ error: "mission_id y agent_id son requeridos." }, { status: 400 });
  }

  // 1b. Verificar ownership: el JWT debe corresponder al agente declarado en el body
  const { data: agentRow, error: agentError } = await admin
    .from("agents")
    .select("id")
    .eq("id", agent_id)
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (agentError || !agentRow) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // 2. Idempotencia — ¿ya existen entradas de ledger para esta misión?
  const { count: existingCount, error: countError } = await admin
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", mission_id);

  if (countError) {
    console.error("[missions/complete] Error al verificar ledger:", countError);
    return NextResponse.json({ error: "Error al verificar ledger." }, { status: 500 });
  }

  if ((existingCount ?? 0) > 0) {
    // Ya tiene movimientos — devolver la misión sin duplicar entradas.
    const { data: existingMission } = await admin
      .from("missions")
      .select("*")
      .eq("id", mission_id)
      .maybeSingle();

    console.log(`[missions/complete] Idempotente: misión ${mission_id} ya tiene ${existingCount} entrada(s) en ledger.`);
    await logEvent({
      event_type:   "ledger.retry_success",
      severity:     "info",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    mission_id,
      actor_type:   "agent",
      actor_id:     agent_id,
      payload:      { ledger_count: existingCount, idempotent: true },
      http_status:  200,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json({ ok: true, mission: existingMission, idempotent: true });
  }

  // 3. UPDATE missions → 'cumplida'
  // Guard: solo si está en 'en_mision' y pertenece al agente correcto.
  // Si la misión ya está 'cumplida' (retry tras fallo del ledger), el UPDATE
  // afecta 0 filas — continuamos igual para hacer el INSERT del ledger.
  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await admin
    .from("missions")
    .update({ status: "cumplida", updated_at: now })
    .eq("id", mission_id)
    .eq("selected_agent_id", agent_id)
    .in("status", ["en_mision", "cumplida"]) // permite retry si ya está cumplida
    .select("*");

  if (updateError) {
    console.error("[missions/complete] Error al actualizar misión:", updateError);
    await logEvent({
      event_type:   "api.complete.error_500",
      severity:     "error",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    mission_id,
      actor_type:   "agent",
      actor_id:     agent_id,
      payload:      { step: "update_status" },
      error_detail: updateError.message,
      http_status:  500,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json({ error: "Error al cerrar la misión." }, { status: 500 });
  }

  // 4. Leer la misión completa (con todos los campos financieros)
  const { data: missionRow, error: fetchError } = await admin
    .from("missions")
    .select("*")
    .eq("id", mission_id)
    .maybeSingle();

  if (fetchError || !missionRow) {
    console.error("[missions/complete] Error al leer misión:", fetchError);
    return NextResponse.json({ error: "Misión no encontrada." }, { status: 404 });
  }

  const mission = missionRow as unknown as ActiveMission;

  // Verificar que la misión fue correctamente cerrada o ya estaba cerrada
  if (mission.status !== "cumplida") {
    await logEvent({
      event_type:   "api.complete.error_409",
      severity:     "warn",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    mission_id,
      actor_type:   "agent",
      actor_id:     agent_id,
      payload:      { actual_status: mission.status },
      error_detail: "La misión no pudo cerrarse. Estado inesperado post-UPDATE.",
      http_status:  409,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json(
      { error: "La misión no pudo cerrarse. Verifica el estado y el agente." },
      { status: 409 }
    );
  }

  // 5a. Validar IDs críticos antes de tocar el ledger (fallo 422 limpio)
  try {
    validateMissionIds(mission);
  } catch (idError) {
    const message = idError instanceof Error ? idError.message : "IDs de misión inválidos.";
    console.error("[missions/complete] IDs inválidos:", message);
    await logEvent({
      event_type:   "api.complete.error_422",
      severity:     "error",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    mission_id,
      actor_type:   "agent",
      actor_id:     agent_id,
      payload:      { step: "validate_ids" },
      error_detail: message,
      http_status:  422,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // 5b. Generar movimientos contables
  const entries = generarMovimientosMision(mission);

  // 5c. Validar balance antes de escribir (nunca insertar un ledger roto)
  try {
    assertLedgerBalance(entries);
  } catch (balanceError) {
    const message = balanceError instanceof Error ? balanceError.message : "Balance contable inconsistente.";
    console.error("[missions/complete] Balance roto:", balanceError);
    await logEvent({
      event_type:   "api.complete.error_500",
      severity:     "critical",
      source:       "api_route",
      entity_type:  "ledger",
      entity_id:    mission_id,
      actor_type:   "system",
      payload:      { step: "assert_balance", entries_count: entries.length },
      error_detail: message,
      http_status:  500,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json(
      { error: "Error interno: balance contable inconsistente." },
      { status: 500 }
    );
  }

  // 6. INSERT todos los movimientos en un solo batch (atómico en Postgres)
  const { error: ledgerError } = await admin
    .from("ledger_entries")
    .insert(entries);

  if (ledgerError) {
    console.error("[missions/complete] Error al insertar ledger:", ledgerError);
    // La misión ya está 'cumplida' — el ledger puede recuperarse con un retry.
    // No revertimos el estado de la misión (el usuario ya vio la confirmación).
    await logEvent({
      event_type:   "ledger.pending",
      severity:     "warn",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    mission_id,
      actor_type:   "agent",
      actor_id:     agent_id,
      payload:      {
        total_amount:  mission.total_amount,
        pricing_rule:  mission.pricing_rule,
        mission_type:  mission.mission_type,
        entries_count: entries.length,
      },
      error_detail: ledgerError.message,
      http_status:  207,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json(
      { error: "Misión cerrada pero ledger no pudo escribirse. Reintentable.", mission },
      { status: 207 }
    );
  }

  console.log(`[missions/complete] Misión ${mission_id} cerrada. ${entries.length} movimientos escritos en ledger.`);

  await logEvent({
    event_type:   "mission.completed",
    severity:     "info",
    source:       "api_route",
    entity_type:  "mission",
    entity_id:    mission_id,
    actor_type:   "agent",
    actor_id:     agent_id,
    payload:      {
      ledger_entries: entries.length,
      ledger_sum:     entries.reduce((s, e) => s + e.monto, 0),
      total_amount:   mission.total_amount,
      costo_agente:   mission.costo_agente,
      ganancia_orbi:  mission.ganancia_orbi,
      pricing_rule:   mission.pricing_rule,
      mission_type:   mission.mission_type,
    },
    http_status:  200,
    duration_ms:  Date.now() - startedAt,
    request_id:   requestId,
  });

  // 7. Respuesta exitosa
  return NextResponse.json({ ok: true, mission, ledger_entries: entries.length });
}
