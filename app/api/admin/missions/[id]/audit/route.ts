/**
 * GET /api/admin/missions/[id]/audit
 *
 * Devuelve los campos económicos de una misión para la Auditoría Económica.
 * Lee únicamente datos existentes en la tabla missions — sin nuevas tablas,
 * sin nueva lógica de negocio.
 *
 * Autenticación: Bearer token del admin (mismo patrón que /api/admin/motor-params).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

const AUDIT_FIELDS = [
  "id",
  "service_type",
  "mission_type",
  "created_at",
  "total_amount",
  "subtotal_productos",
  "service_fee",
  "costo_agente",
  "ganancia_orbi",
  "pricing_rule",
  "motor_params_version",
  "distance_km",
  "status",
].join(", ");

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) return { user: null, admin: null };

  const admin = getAdmin();
  if (!admin) return { user: null, admin: null };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { user: null, admin: null };

  const email = (data.user.email ?? "").toLowerCase();
  if (!getAdminEmails().includes(email)) return { user: null, admin: null };

  return { user: data.user, admin };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, admin } = await resolveAdmin(req);
  if (!user || !admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID de misión requerido." }, { status: 400 });
  }

  const { data: raw, error } = await admin
    .from("missions")
    .select(AUDIT_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `Error al leer misión: ${error.message}` }, { status: 500 });
  }

  if (!raw) {
    return NextResponse.json({ error: "Misión no encontrada." }, { status: 404 });
  }

  const data = raw as unknown as Record<string, unknown>;

  const serviceFee      = data.service_fee      as number | null;
  const costoAgente     = data.costo_agente     as number | null;
  const gananciaOrbi    = data.ganancia_orbi    as number | null;
  const subtotal        = data.subtotal_productos as number | null;
  const totalAmount     = data.total_amount     as number | null;

  // Verificación del invariante: totalCliente = serviceFee + subtotal (si hay productos)
  const totalEsperado =
    serviceFee != null && subtotal != null
      ? serviceFee + subtotal
      : serviceFee ?? null;

  const invariantOk =
    totalEsperado != null && totalAmount != null
      ? Math.abs(totalEsperado - totalAmount) < 0.01
      : null;

  // Verificación INV-P1: gananciaOrbi ≥ 0
  const invP1Ok = gananciaOrbi != null ? gananciaOrbi >= 0 : null;

  return NextResponse.json({
    id:                   data.id,
    service_type:         data.service_type,
    mission_type:         data.mission_type,
    status:               data.status,
    created_at:           data.created_at,
    distance_km:          data.distance_km,
    total_amount:         totalAmount,
    subtotal_productos:   subtotal,
    service_fee:          serviceFee,
    costo_agente:         costoAgente,
    ganancia_orbi:        gananciaOrbi,
    pricing_rule:         data.pricing_rule,
    motor_params_version: data.motor_params_version,
    invariant_ok:         invariantOk,
    inv_p1_ok:            invP1Ok,
  });
}
