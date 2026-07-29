import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  let body: { id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { id } = body;
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json({ error: "ID de agente requerido." }, { status: 400 });
  }

  // Verify agent exists
  const { data: agent, error: fetchErr } = await admin
    .from("agents")
    .select("id, admin_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });

  // Idempotent: already deactivated
  if (agent.admin_status === "desactivado") {
    return NextResponse.json({ ok: true });
  }

  // Logical deletion: deactivate without touching auth, history, missions, ledger, ratings.
  // Note: agents.status has a DB check constraint — only "Disponible" is currently valid.
  // Visibility is controlled exclusively via admin_status; no status change needed.
  const { error: updateErr } = await admin
    .from("agents")
    .update({
      admin_status: "desactivado",
      is_on_orbit: false,
    })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
