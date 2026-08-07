/**
 * POST /api/push/register — PUSH-01c
 *
 * Registra o actualiza el FCM token del dispositivo del usuario autenticado.
 *
 * - auth_user_id se resuelve siempre del JWT. Nunca se acepta del body.
 * - El role se resuelve del servidor (agents → business → customers). Nunca del body.
 * - Hace UPSERT: si el device_id ya tiene un token, lo actualiza.
 * - No conectado a ningún flujo de misiones. Aislado hasta PUSH-02.
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
  let body: { token?: unknown; platform?: unknown; device_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON malformado." }, { status: 400 });
  }

  const { token, platform, device_id } = body;

  if (typeof token !== "string" || token.trim() === "") {
    return NextResponse.json({ error: "token es requerido." }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "platform debe ser 'ios' o 'android'." }, { status: 400 });
  }
  const deviceId = typeof device_id === "string" && device_id.trim() !== ""
    ? device_id.trim()
    : null;

  // 3. Resolver role desde el servidor — nunca del body
  const db = adminClient();
  let role: "agent" | "business" | "customer" | null = null;

  const { data: agentRow } = await db
    .from("agents")
    .select("id")
    .eq("auth_user_id", auth_user_id)
    .maybeSingle();
  if (agentRow) role = "agent";

  if (!role) {
    const { data: bizRow } = await db
      .from("businesses")
      .select("id")
      .eq("auth_user_id", auth_user_id)
      .maybeSingle();
    if (bizRow) role = "business";
  }

  if (!role) {
    const { data: custRow } = await db
      .from("customers")
      .select("id")
      .eq("auth_user_id", auth_user_id)
      .maybeSingle();
    if (custRow) role = "customer";
  }

  if (!role) {
    return NextResponse.json({ error: "NO_ACCOUNT_FOUND" }, { status: 403 });
  }

  // 4. Si el request incluye device_id, deshabilitar tokens activos de otros usuarios
  //    en ese mismo dispositivo antes del UPSERT (segunda defensa tras /api/push/unregister).
  //    Build 8 y registros legacy (deviceId = null) nunca entran aquí.
  const now = new Date().toISOString();
  if (deviceId) {
    await db
      .from("device_tokens")
      .update({ enabled: false, updated_at: now })
      .eq("device_id", deviceId)
      .neq("auth_user_id", auth_user_id)
      .eq("enabled", true);
  }

  // 5. UPSERT — si cambia el token para el mismo device_id, lo actualiza
  const { error: upsertError } = await db
    .from("device_tokens")
    .upsert(
      {
        auth_user_id,
        role,
        platform,
        token_type: "fcm",
        token: token.trim(),
        device_id: deviceId,
        enabled: true,
        last_seen_at: now,
        updated_at: now,
      },
      {
        onConflict: deviceId ? "auth_user_id,device_id" : "token",
        ignoreDuplicates: false,
      }
    );

  if (upsertError) {
    console.error("[push/register] UPSERT error:", upsertError.message);
    return NextResponse.json({ error: "Error al registrar token." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
