/**
 * PATCH /api/intention-logs/[id]
 *
 * Completa un log de interpretación con el resultado final.
 * Llamado cuando la misión se crea (o para registrar abandono con resultado_final null).
 * Sin autenticación — misma sesión de cliente que creó el log.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "ID requerido." }, { status: 400 });
  }

  const resultadoFinal = typeof body.resultado_final === "string" ? body.resultado_final.trim() : null;
  const missionId      = typeof body.mission_id      === "string" ? body.mission_id              : null;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }

  const { error } = await admin
    .from("intention_logs")
    .update({ resultado_final: resultadoFinal, mission_id: missionId })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
