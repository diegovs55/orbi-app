/**
 * POST /api/agents/vehicles/activate
 *
 * Body: { vehicle_id: "<UUID>" }  → activa ese vehículo del agente
 *       { vehicle_id: null }      → establece active_vehicle_id = NULL (desactiva)
 *
 * Idempotente en ambos casos (mismo UUID o null repetido → 200 ok).
 * El agente_id se resuelve exclusivamente desde JWT — nunca desde el body.
 * Doble comprobación app-level + trigger DB como segunda guardia.
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

  // vehicle_id debe ser UUID válido o null exacto
  const rawVehicleId = "vehicle_id" in body ? body.vehicle_id : undefined;
  if (rawVehicleId === undefined) {
    return NextResponse.json({ error: "INVALID_VEHICLE_ID", detail: "vehicle_id requerido (UUID o null)." }, { status: 400 });
  }
  if (rawVehicleId !== null && (typeof rawVehicleId !== "string" || !UUID_RE.test(rawVehicleId))) {
    return NextResponse.json({ error: "INVALID_VEHICLE_ID", detail: "vehicle_id debe ser un UUID válido o null." }, { status: 400 });
  }

  const vehicleId = rawVehicleId as string | null;

  // Resolver agente desde JWT
  const { data: agentRow } = await admin
    .from("agents")
    .select("id,active_vehicle_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (!agentRow) return NextResponse.json({ error: "NO_AGENT_ACCOUNT" }, { status: 403 });

  const agentId           = agentRow.id as string;
  const currentActiveId   = (agentRow.active_vehicle_id as string | null) ?? null;

  // Idempotencia
  if (vehicleId === currentActiveId) {
    return NextResponse.json({ ok: true, active_vehicle_id: vehicleId });
  }

  // Si UUID: verificar ownership y que no esté archivado (doble comprobación app-level)
  if (vehicleId !== null) {
    const { data: vRow } = await admin
      .from("agent_vehicles")
      .select("id,agent_id,archived_at")
      .eq("id", vehicleId)
      .maybeSingle();

    if (!vRow || (vRow.agent_id as string) !== agentId) {
      return NextResponse.json({ error: "VEHICLE_NOT_OWNED", detail: "El vehículo no pertenece a este agente." }, { status: 403 });
    }
    if ((vRow.archived_at as string | null) !== null) {
      return NextResponse.json({ error: "VEHICLE_ARCHIVED", detail: "No puedes activar un vehículo archivado." }, { status: 422 });
    }
  }

  // UPDATE — el trigger trg_chk_active_vehicle es la guardia definitiva en DB
  const { error: updateError } = await admin
    .from("agents")
    .update({ active_vehicle_id: vehicleId })
    .eq("id", agentId);

  if (updateError) {
    return NextResponse.json({ error: "INTERNAL_ERROR", detail: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, active_vehicle_id: vehicleId });
}
