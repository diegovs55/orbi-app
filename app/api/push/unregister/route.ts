/**
 * POST /api/push/unregister — PUSH-01b Fase A
 *
 * Deshabilita el token FCM del dispositivo para el usuario autenticado.
 * Llamado en logout del agente antes de destruir el JWT.
 * Best-effort: el cliente no bloquea el logout si este endpoint falla.
 *
 * Segunda defensa: si este endpoint no se alcanza, el próximo
 * POST /api/push/register para el mismo device_id limpia la asociación anterior.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // 1. Resolver identidad del llamante desde el JWT
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { createClient: createUserClient } = await import("@supabase/supabase-js");
  const userClient = createUserClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const auth_user_id = user.id;

  // 2. Parsear body
  let body: { device_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON malformado." }, { status: 400 });
  }

  const { device_id } = body;
  if (typeof device_id !== "string" || device_id.trim() === "") {
    return NextResponse.json({ error: "device_id es requerido." }, { status: 400 });
  }

  // 3. Deshabilitar token del dispositivo para este usuario
  const db = adminClient();
  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from("device_tokens")
    .update({ enabled: false, updated_at: now })
    .eq("auth_user_id", auth_user_id)
    .eq("device_id", device_id.trim());

  if (updateError) {
    console.error("[push/unregister] UPDATE error:", updateError.message);
    return NextResponse.json({ error: "Error al deshabilitar token." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
