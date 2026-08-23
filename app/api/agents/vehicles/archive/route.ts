/**
 * POST /api/agents/vehicles/archive
 *
 * Body: { vehicle_id: "<UUID>" }
 *
 * Establece archived_at = NOW() en el vehículo.
 * No está disponible hard-delete en V1.
 *
 * Rechaza explícitamente si el vehículo es el active_vehicle_id actual
 * antes de llegar al trigger DB (trg_chk_archive_vehicle es segunda guardia).
 * El agente_id se resuelve exclusivamente desde JWT.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "JSON malformado." }, { status: 400 }); }

  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id : null;
  if (!vehicleId || !UUID_RE.test(vehicleId)) {
    return NextResponse.json({ error: "INVALID_VEHICLE_ID", detail: "vehicle_id debe ser un UUID válido." }, { status: 400 });
  }

  // Resolver agente desde JWT
  const { data: agentRow } = await admin
    .from("agents")
    .select("id,active_vehicle_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (!agentRow) return NextResponse.json({ error: "NO_AGENT_ACCOUNT" }, { status: 403 });

  const agentId         = agentRow.id as string;
  const activeVehicleId = (agentRow.active_vehicle_id as string | null) ?? null;

  // Ownership
  const { data: vRow } = await admin
    .from("agent_vehicles")
    .select("id,agent_id,archived_at")
    .eq("id", vehicleId)
    .maybeSingle();

  if (!vRow || (vRow.agent_id as string) !== agentId) {
    return NextResponse.json({ error: "VEHICLE_NOT_OWNED", detail: "El vehículo no pertenece a este agente." }, { status: 403 });
  }

  // Rechazar explícitamente antes del trigger — mensaje claro para la UI
  if (vehicleId === activeVehicleId) {
    return NextResponse.json(
      { error: "VEHICLE_IS_ACTIVE", detail: "Desactiva el vehículo antes de archivarlo." },
      { status: 422 }
    );
  }

  // UPDATE — trg_chk_archive_vehicle es segunda guardia en DB
  const { error: updateError } = await admin
    .from("agent_vehicles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", vehicleId);

  if (updateError) {
    return NextResponse.json({ error: "INTERNAL_ERROR", detail: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
