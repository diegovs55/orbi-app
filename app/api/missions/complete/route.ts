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

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { generarMovimientosMision, assertLedgerBalance, validateMissionIds } from "@/lib/ledger";
import type { ActiveMission } from "@/lib/missions";

// ── Admin client (SERVICE_ROLE_KEY — nunca exponer al cliente) ───────────────

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

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
    return NextResponse.json(
      { error: message },
      { status: 422 }
    );
  }

  // 5b. Generar movimientos contables
  const entries = generarMovimientosMision(mission);

  // 5c. Validar balance antes de escribir (nunca insertar un ledger roto)
  try {
    assertLedgerBalance(entries);
  } catch (balanceError) {
    console.error("[missions/complete] Balance roto:", balanceError);
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
    return NextResponse.json(
      { error: "Misión cerrada pero ledger no pudo escribirse. Reintentable.", mission },
      { status: 207 } // 207 Multi-Status: parcialmente exitoso
    );
  }

  console.log(`[missions/complete] Misión ${mission_id} cerrada. ${entries.length} movimientos escritos en ledger.`);

  // 7. Respuesta exitosa
  return NextResponse.json({ ok: true, mission, ledger_entries: entries.length });
}
