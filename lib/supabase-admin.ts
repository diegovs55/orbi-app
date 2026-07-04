/**
 * ORBI — Supabase Admin Client
 *
 * Fuente única del cliente con SERVICE_ROLE_KEY.
 * Todas las API Routes y helpers del servidor importan desde aquí.
 *
 * getAdmin() devuelve null si las variables de entorno no están configuradas,
 * permitiendo que cada route maneje el error con su propio mensaje.
 *
 * generateTempPassword() produce contraseñas temporales legibles (sin 0/O, 1/l/I).
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

let _admin: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export function generateTempPassword(): string {
  // Unambiguous chars — no 0/O, 1/l/I
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join("");
}
