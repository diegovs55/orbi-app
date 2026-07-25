import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  let businessId: string;
  let action: "desactivar" | "activar";
  try {
    const body = (await req.json()) as { businessId?: string; action?: string };
    businessId = body.businessId?.trim() ?? "";
    action = body.action === "activar" ? "activar" : "desactivar";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!businessId) return NextResponse.json({ error: "businessId is required." }, { status: 400 });

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
    return NextResponse.json(
      { error: "El negocio está eliminado y no puede ser reactivado ni desactivado." },
      { status: 409 }
    );
  }

  const newStatus = action === "activar" ? "activo" : "inactivo";

  const { error: updateError } = await admin
    .from("businesses")
    .update({ status: newStatus })
    .eq("id", businessId);

  if (updateError) {
    console.error("[businesses/deactivate] error actualizando status:", updateError.message);
    return NextResponse.json({ error: "No fue posible actualizar el estado del negocio." }, { status: 500 });
  }

  if (row.auth_user_id) {
    const banDuration = action === "activar" ? "none" : "876600h";
    const { error: banError } = await admin.auth.admin.updateUserById(row.auth_user_id, {
      ban_duration: banDuration,
    });
    if (banError) {
      console.error("[businesses/deactivate] error actualizando ban en Auth:", banError.message);
      // Status ya fue cambiado. Loguear sin revertir — la operación de DB fue exitosa.
    }
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
