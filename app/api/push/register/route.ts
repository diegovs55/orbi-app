/**
 * POST /api/push/register — PUSH-03
 *
 * Registra o actualiza el FCM token del dispositivo del usuario autenticado.
 *
 * - auth_user_id se resuelve siempre del JWT. Nunca se acepta del body.
 * - El role se resuelve del servidor (agents → business → customers). Nunca del body.
 * - device_id es obligatorio: identifica la instalación física. Rechaza 400 si falta.
 * - UPSERT atómico por device_id: una sola fila por instalación, auth_user_id y role
 *   se actualizan al cambiar de sesión. token FCM se actualiza si rota.
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
  if (typeof device_id !== "string" || device_id.trim() === "") {
    return NextResponse.json({ error: "device_id es requerido." }, { status: 400 });
  }
  const deviceId = device_id.trim();

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

  // 4. Deshabilitar tokens activos de otros usuarios en el mismo dispositivo
  //    antes del UPSERT (segunda defensa tras /api/push/unregister).
  //    Con UNIQUE(device_id) solo puede existir una fila por device_id; este paso
  //    es redundante para filas non-NULL pero inofensivo. Se conserva para cubrir
  //    el caso edge de filas legacy que hubieran quedado con el mismo device_id
  //    bajo un auth_user_id distinto antes de la migración v2.
  const now = new Date().toISOString();
  await db
    .from("device_tokens")
    .update({ enabled: false, updated_at: now })
    .eq("device_id", deviceId)
    .neq("auth_user_id", auth_user_id)
    .eq("enabled", true);

  // 5. UPSERT atómico por device_id (identidad canónica de instalación).
  //    Si device_id ya existe → DO UPDATE: actualiza auth_user_id, role, token, etc.
  //    Si device_id no existe → INSERT nueva fila.
  //    El cambio de sesión (agent → business → customer) actualiza la misma fila.
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
        onConflict: "device_id",
        ignoreDuplicates: false,
      }
    );

  if (upsertError) {
    console.error("[push/register] UPSERT error:", upsertError.message);
    return NextResponse.json({ error: "Error al registrar token." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
