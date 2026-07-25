import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  // ── 1. Autorización ────────────────────────────────────────────────────────
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  // ── 2. Body ────────────────────────────────────────────────────────────────
  let agentId: string;
  let action: "desactivar" | "reactivar";
  try {
    const body = (await req.json()) as { agentId?: string; action?: string };
    agentId = body.agentId?.trim() ?? "";
    action = body.action === "reactivar" ? "reactivar" : "desactivar";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!agentId) return NextResponse.json({ error: "agentId is required." }, { status: 400 });

  // ── 3. Leer agente ─────────────────────────────────────────────────────────
  const { data: agentRow, error: fetchError } = await admin
    .from("agents")
    .select("id,name,auth_user_id,admin_status")
    .eq("id", agentId)
    .maybeSingle();

  if (fetchError || !agentRow) {
    return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });
  }

  const row = agentRow as {
    id: string;
    name: string;
    auth_user_id: string | null;
    admin_status: string | null;
  };

  const currentAdminStatus = row.admin_status ?? "activo";
  const targetAdminStatus = action === "reactivar" ? "activo" : "desactivado";

  // ── 4. Idempotencia ────────────────────────────────────────────────────────
  if (currentAdminStatus === targetAdminStatus) {
    return NextResponse.json({
      ok: true,
      alreadyInState: true,
      adminStatus: targetAdminStatus,
      agentId: row.id,
    });
  }

  // ── 5. Actualizar admin_status — no toca agents.status ni ningún campo operativo
  const { error: updateError } = await admin
    .from("agents")
    .update({ admin_status: targetAdminStatus })
    .eq("id", agentId);

  if (updateError) {
    console.error("[agents/suspend] error actualizando admin_status:", updateError.message);
    return NextResponse.json(
      { error: "No fue posible actualizar el estado administrativo del agente." },
      { status: 500 }
    );
  }

  // ── 6. Ban / unban en Supabase Auth (best-effort; no revierte la DB) ───────
  if (row.auth_user_id) {
    const banDuration = action === "reactivar" ? "none" : "876600h";
    const { error: banError } = await admin.auth.admin.updateUserById(row.auth_user_id, {
      ban_duration: banDuration,
    });
    if (banError) {
      console.error("[agents/suspend] error en Auth ban/unban:", banError.message);
      // admin_status ya fue actualizado. Logueamos pero no revertimos.
    }
  }

  return NextResponse.json({
    ok: true,
    adminStatus: targetAdminStatus,
    agentId: row.id,
  });
}
