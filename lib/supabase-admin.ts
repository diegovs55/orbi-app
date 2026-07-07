/**
 * ORBI — Supabase Admin Client
 *
 * Fuente única del cliente con SERVICE_ROLE_KEY.
 * Todas las API Routes y helpers del servidor importan desde aquí.
 *
 * getAdmin() devuelve null si las variables de entorno no están configuradas,
 * permitiendo que cada route maneje el error con su propio mensaje.
 *
 * assertAdminJWT(req) verifica que el caller sea un admin autorizado.
 * Devuelve { ok: true } o un NextResponse 401/403 listo para retornar.
 *
 * generateTempPassword() produce contraseñas temporales legibles (sin 0/O, 1/l/I).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

let _admin: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "[supabase-admin] getAdmin() failed — missing env vars:",
      { NEXT_PUBLIC_SUPABASE_URL: !!url, SUPABASE_SERVICE_ROLE_KEY: !!key }
    );
    return null;
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

/**
 * Verifica que el caller sea un administrador autorizado.
 * Lee el Bearer token del header Authorization, lo valida con Supabase Auth
 * y comprueba que el email esté en ADMIN_EMAILS.
 *
 * Uso en API Routes:
 *   const authResult = await assertAdminJWT(req);
 *   if (authResult instanceof NextResponse) return authResult;
 */
export async function assertAdminJWT(
  req: NextRequest
): Promise<{ ok: true } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const email = (data.user.email ?? "").toLowerCase();
  const raw = process.env.ADMIN_EMAILS ?? "";
  const allowed = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0 || !allowed.includes(email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return { ok: true };
}

export function generateTempPassword(): string {
  // Unambiguous chars — no 0/O, 1/l/I
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join("");
}
