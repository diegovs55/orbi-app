/**
 * GET  /api/admin/motor-params  — lista parámetros activos + historial reciente
 * PATCH /api/admin/motor-params — actualiza un parámetro y registra el cambio
 *
 * Autenticación: Bearer token del admin (mismo patrón que /api/admin/verify).
 * Solo emails en ADMIN_EMAILS pueden escribir. Lectura también restringida.
 *
 * PATCH body: { scope, key, value, reason }
 *   - scope   : "zumpahuacan" u otro identificador geográfico
 *   - key     : nombre del parámetro (debe existir en motor_params)
 *   - value   : número válido, finito y positivo
 *   - reason  : texto no vacío (Principio IV — transparencia)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim() || null;
  if (!token) return { user: null, admin: null };

  const admin = getAdmin();
  if (!admin) return { user: null, admin: null };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { user: null, admin: null };

  const email = (data.user.email ?? "").toLowerCase();
  if (!getAdminEmails().includes(email)) return { user: null, admin: null };

  return { user: data.user, admin };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { user, admin } = await resolveAdmin(req);
  if (!user || !admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const scope = new URL(req.url).searchParams.get("scope") ?? "zumpahuacan";

  const [paramsRes, historyRes] = await Promise.all([
    admin
      .from("motor_params")
      .select("id, scope, key, value, unit, description, created_at")
      .eq("scope", scope)
      .order("key"),
    admin
      .from("motor_params_history")
      .select("id, scope, key, old_value, new_value, changed_by, changed_at, reason")
      .eq("scope", scope)
      .order("changed_at", { ascending: false })
      .limit(20),
  ]);

  if (paramsRes.error) {
    return NextResponse.json({ error: paramsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    params:  paramsRes.data  ?? [],
    history: historyRes.data ?? [],
  });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { user, admin } = await resolveAdmin(req);
  if (!user || !admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const scope  = typeof body.scope  === "string" ? body.scope.trim()  : "";
  const key    = typeof body.key    === "string" ? body.key.trim()    : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const value  = typeof body.value  === "number" ? body.value : Number(body.value);

  if (!scope)                          return NextResponse.json({ error: "scope es requerido."  }, { status: 400 });
  if (!key)                            return NextResponse.json({ error: "key es requerido."    }, { status: 400 });
  if (!reason)                         return NextResponse.json({ error: "reason es requerido." }, { status: 400 });
  if (!Number.isFinite(value) || value <= 0)
    return NextResponse.json({ error: "value debe ser un número válido y positivo." }, { status: 400 });

  // Leer valor actual para registrar old_value
  const { data: current, error: readError } = await admin
    .from("motor_params")
    .select("id, value")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!current)  return NextResponse.json({ error: `Parámetro '${key}' no existe en scope '${scope}'.` }, { status: 404 });

  const oldValue = Number(current.value);

  // Actualizar valor activo
  const { error: updateError } = await admin
    .from("motor_params")
    .update({ value })
    .eq("id", current.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Registrar en historial append-only
  const { data: histRow, error: histError } = await admin
    .from("motor_params_history")
    .insert({ scope, key, old_value: oldValue, new_value: value, changed_by: user.id, reason })
    .select("id")
    .single();

  if (histError) {
    // El valor ya fue actualizado. Registrar el error pero no revertir —
    // la falta de historial es preferible a revertir el precio sin aviso.
    console.error("[motor-params] Error al escribir historial:", histError.message);
    return NextResponse.json({ error: "Parámetro actualizado pero el historial no se registró. Revisar logs." }, { status: 207 });
  }

  return NextResponse.json({ ok: true, history_id: histRow.id });
}
