import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

const ACTIVE_MISSION_STATUSES = [
  "por_tomar",
  "asignada",
  "aceptada",
  "en_camino_negocio",
  "en_negocio",
  "preparando",
  "listo",
  "en_camino_cliente",
  "llegando",
];

export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  let businessId: string;
  try {
    const body = (await req.json()) as { businessId?: string };
    businessId = body.businessId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

  // ── 1. Leer la ficha del negocio ───────────────────────────────────────────
  const { data: biz, error: fetchError } = await admin
    .from("businesses")
    .select("id,name,auth_user_id,status")
    .eq("id", businessId)
    .maybeSingle();

  if (fetchError || !biz) {
    return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
  }

  const row = biz as { id: string; name: string; auth_user_id: string | null; status: string };

  if (row.status === "eliminado") {
    return NextResponse.json({ error: "El negocio ya está eliminado." }, { status: 409 });
  }

  // ── 2. Verificar misiones activas o en proceso ─────────────────────────────
  const { data: activeMissions, error: missionsError } = await admin
    .from("missions")
    .select("id,status")
    .eq("business_id", businessId)
    .in("status", ACTIVE_MISSION_STATUSES);

  if (missionsError) {
    console.error("[businesses/delete] error verificando misiones:", missionsError.message);
    return NextResponse.json({ error: "No fue posible verificar las operaciones activas." }, { status: 500 });
  }

  if (activeMissions && activeMissions.length > 0) {
    return NextResponse.json(
      {
        error:
          `El negocio tiene ${activeMissions.length} operación${activeMissions.length > 1 ? "es" : ""} activa${activeMissions.length > 1 ? "s" : ""} en curso. ` +
          "Espera a que finalicen antes de eliminar.",
      },
      { status: 409 }
    );
  }

  // ── 3. Marcar como eliminado (baja lógica irreversible) ────────────────────
  const { error: updateError } = await admin
    .from("businesses")
    .update({ status: "eliminado" })
    .eq("id", businessId);

  if (updateError) {
    console.error("[businesses/delete] error marcando como eliminado:", updateError.message);
    return NextResponse.json({ error: "No fue posible eliminar el negocio." }, { status: 500 });
  }

  // ── 4. Eliminar el usuario Auth (acceso bloqueado permanentemente) ──────────
  // La fila de businesses y todo el historial se conservan intactos.
  if (row.auth_user_id) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(row.auth_user_id);
    if (deleteUserError) {
      console.error("[businesses/delete] error eliminando Auth user:", deleteUserError.message);
      // El negocio ya está marcado como eliminado. Loguear sin revertir.
    }
  }

  return NextResponse.json({ ok: true });
}
