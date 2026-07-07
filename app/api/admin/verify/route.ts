/**
 * GET /api/admin/verify
 *
 * Verifica que el JWT del request pertenece a un administrador autorizado.
 * La lista de emails admin vive en ADMIN_EMAILS (server-only, sin NEXT_PUBLIC_).
 *
 * Returns:
 *   200 { isAdmin: true }  — JWT válido y email en la lista de admins.
 *   401 { isAdmin: false } — Sin JWT, JWT inválido, o email no autorizado.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  // Extract Bearer token from Authorization header
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ isAdmin: false }, { status: 500 });
  }

  // Verify the JWT and extract the user (service role verifies any valid JWT)
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  const email = (data.user.email ?? "").toLowerCase();
  const allowedEmails = getAdminEmails();

  if (allowedEmails.length === 0) {
    // No admin emails configured — deny all to prevent accidental open access.
    console.error("[admin/verify] ADMIN_EMAILS no configurado. Acceso denegado.");
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  const isAdmin = allowedEmails.includes(email);
  return NextResponse.json({ isAdmin }, { status: isAdmin ? 200 : 401 });
}
