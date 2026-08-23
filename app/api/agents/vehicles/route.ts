/**
 * GET  /api/agents/vehicles — lista vehículos del agente autenticado
 * POST /api/agents/vehicles — crea un vehículo para el agente autenticado
 *
 * Seguridad:
 * - agent_id derivado exclusivamente del JWT; nunca del body.
 * - agent_vehicles sin policies para authenticated: acceso exclusivo via service_role.
 * - Crear un vehículo NO activa automáticamente active_vehicle_id.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import {
  VEHICLE_TYPES,
  isValidVehicleType,
  validateDisplayLabel,
  type AgentVehicle,
} from "@/lib/vehicles";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: agentRow } = await admin
    .from("agents")
    .select("id,active_vehicle_id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (!agentRow) return NextResponse.json({ error: "NO_AGENT_ACCOUNT" }, { status: 403 });

  const agentId          = agentRow.id as string;
  const activeVehicleId  = (agentRow.active_vehicle_id as string | null) ?? null;

  const { data: rows, error: listError } = await admin
    .from("agent_vehicles")
    .select("id,vehicle_type,display_label,archived_at,created_at")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });

  if (listError) {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }

  // Orden: activo primero, luego no archivados por created_at, luego archivados
  const vehicles: AgentVehicle[] = (rows ?? [])
    .map((r) => ({
      id:            r.id as string,
      vehicle_type:  r.vehicle_type as AgentVehicle["vehicle_type"],
      display_label: r.display_label as string,
      archived_at:   (r.archived_at as string | null) ?? null,
      created_at:    r.created_at as string,
      is_active:     r.id === activeVehicleId,
    }))
    .sort((a, b) => {
      if (a.is_active && !b.is_active) return -1;
      if (!a.is_active && b.is_active) return 1;
      if (!a.archived_at && b.archived_at) return -1;
      if (a.archived_at && !b.archived_at) return 1;
      return a.created_at < b.created_at ? -1 : 1;
    });

  return NextResponse.json({ active_vehicle_id: activeVehicleId, vehicles });
}

// ── POST ──────────────────────────────────────────────────────────────────────

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

  // vehicle_type
  if (!isValidVehicleType(body.vehicle_type)) {
    return NextResponse.json(
      { error: "INVALID_VEHICLE_TYPE", detail: `Debe ser uno de: ${VEHICLE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // display_label
  const labelResult = validateDisplayLabel(body.display_label);
  if (!labelResult.ok) {
    return NextResponse.json({ error: "INVALID_DISPLAY_LABEL", detail: labelResult.error }, { status: 400 });
  }

  // Resolver agente desde JWT — agent_id del body ignorado
  const { data: agentRow } = await admin
    .from("agents")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (!agentRow) return NextResponse.json({ error: "NO_AGENT_ACCOUNT" }, { status: 403 });

  const agentId = agentRow.id as string;

  const { data: newVehicle, error: insertError } = await admin
    .from("agent_vehicles")
    .insert({ agent_id: agentId, vehicle_type: body.vehicle_type, display_label: labelResult.value })
    .select("id,vehicle_type,display_label,archived_at,created_at")
    .single();

  if (insertError || !newVehicle) {
    return NextResponse.json({ error: "INTERNAL_ERROR", detail: insertError?.message }, { status: 500 });
  }

  const vehicle: AgentVehicle = {
    id:            newVehicle.id as string,
    vehicle_type:  newVehicle.vehicle_type as AgentVehicle["vehicle_type"],
    display_label: newVehicle.display_label as string,
    archived_at:   null,
    created_at:    newVehicle.created_at as string,
    is_active:     false, // crear NO activa automáticamente
  };

  return NextResponse.json({ vehicle }, { status: 201 });
}
