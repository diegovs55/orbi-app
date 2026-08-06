/**
 * POST /api/push/test — PUSH-01c
 *
 * Endpoint de prueba manual para verificar el flujo FCM extremo a extremo.
 * Protegido por SERVICE_ROLE_KEY — nunca accesible desde el cliente web o iOS.
 *
 * Solo para validación de PUSH-01. Se eliminará o protegerá antes de producción masiva.
 */

import { NextRequest, NextResponse } from "next/server";
import { sendPushToUser } from "@/lib/push";

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Solo accesible con la service_role key en el header — nunca desde el cliente
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided !== SERVICE_ROLE) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: { auth_user_id?: unknown; title?: unknown; body?: unknown; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON malformado." }, { status: 400 });
  }

  const { auth_user_id, title, body: msgBody, data } = body;

  if (typeof auth_user_id !== "string" || auth_user_id.trim() === "") {
    return NextResponse.json({ error: "auth_user_id es requerido." }, { status: 400 });
  }
  if (typeof title !== "string" || title.trim() === "") {
    return NextResponse.json({ error: "title es requerido." }, { status: 400 });
  }
  if (typeof msgBody !== "string" || msgBody.trim() === "") {
    return NextResponse.json({ error: "body es requerido." }, { status: 400 });
  }

  await sendPushToUser(auth_user_id.trim(), {
    title: title.trim(),
    body: msgBody.trim(),
    ...(data && typeof data === "object" ? { data: data as Record<string, string> } : {}),
  });

  return NextResponse.json({ ok: true, sent_to: auth_user_id.trim() });
}
