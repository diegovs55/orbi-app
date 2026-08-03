/**
 * GET /api/missions/by-id?id={uuid}
 *
 * Devuelve una misión por ID. Requiere siempre Bearer JWT válido.
 * Sin JWT → 401. JWT válido pero sin acceso a la misión → 403. Misión no existe → 404.
 *
 * Roles y ownership:
 *   admin   — ADMIN_EMAILS env; acceso irrestricto.
 *   agente  — agents.auth_user_id = callerUid → agents.id debe coincidir con mission.selected_agent_id.
 *   negocio — businesses.auth_user_id = callerUid → businesses.name debe coincidir con mission.business_name.
 *   cliente — mission.user_id = callerUid (cliente registrado).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 1. Extraer y validar Bearer JWT
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || null;
  if (!token) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const callerUid = authData.user.id;
  const callerEmail = (authData.user.email ?? "").toLowerCase();

  // 2. Validar query param
  const { searchParams } = new URL(req.url);
  const missionId = searchParams.get("id") ?? "";
  if (!missionId || !UUID_RE.test(missionId)) {
    return NextResponse.json({ error: "id debe ser un UUID válido." }, { status: 400 });
  }

  // 3. Cargar misión con service_role
  const { data: missionRow, error: missionError } = await admin
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .maybeSingle();

  if (missionError) {
    console.error("[missions/by-id] query error:", missionError);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
  if (!missionRow) {
    return NextResponse.json({ error: "MISSION_NOT_FOUND" }, { status: 404 });
  }

  // 4. Verificar acceso según rol

  // Admin: acceso irrestricto
  if (ADMIN_EMAILS.includes(callerEmail)) {
    return NextResponse.json({ mission: missionRow });
  }

  // Agente: agents.auth_user_id = callerUid → agents.id debe coincidir con selected_agent_id
  const { data: agentRow } = await admin
    .from("agents")
    .select("id")
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (agentRow) {
    if ((missionRow.selected_agent_id as string | null) === (agentRow.id as string)) {
      return NextResponse.json({ mission: missionRow });
    }
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Negocio: businesses.auth_user_id = callerUid → businesses.name debe coincidir con business_name
  const { data: bizRow } = await admin
    .from("businesses")
    .select("id,name")
    .eq("auth_user_id", callerUid)
    .maybeSingle();

  if (bizRow) {
    if ((missionRow.business_name as string | null) === (bizRow.name as string)) {
      return NextResponse.json({ mission: missionRow });
    }
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Cliente registrado: mission.user_id = callerUid
  if ((missionRow.user_id as string | null) === callerUid) {
    return NextResponse.json({ mission: missionRow });
  }

  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}
