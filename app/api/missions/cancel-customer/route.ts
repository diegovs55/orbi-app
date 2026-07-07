/**
 * POST /api/missions/cancel-customer
 *
 * Permite que un cliente (guest o registrado) cancele su propia misión activa.
 * Usa SERVICE_ROLE_KEY para el UPDATE — el anon client nunca escribe en missions.
 *
 * Guards:
 *   - Solo cancela si el status actual está en [por_tomar, aceptada, en_mision].
 *   - Requiere mission_id en el body.
 *   - No requiere JWT: clientes son anónimos en el MVP.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


const CANCELLABLE_STATUSES = ["por_tomar", "aceptada", "en_mision"] as const;

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let body: { mission_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { mission_id } = body;
  if (!mission_id || typeof mission_id !== "string") {
    return NextResponse.json({ error: "mission_id es requerido." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("missions")
    .update({ status: "cancelada", updated_at: now })
    .eq("id", mission_id)
    .in("status", CANCELLABLE_STATUSES)
    .select("id, status");

  if (error) {
    console.error("[missions/cancel-customer] Error:", error.message);
    return NextResponse.json({ error: "No se pudo cancelar la misión." }, { status: 500 });
  }

  const updated = Array.isArray(data) ? data[0] : null;
  if (!updated) {
    return NextResponse.json(
      { error: "La misión no existe o ya no se puede cancelar." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
