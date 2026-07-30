import { NextRequest, NextResponse } from "next/server";
import { assertAdminJWT, getAdmin } from "@/lib/supabase-admin";

export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  // Dual auth: admin shortcut OR verified business owner
  const adminResult = await assertAdminJWT(req);
  const isAdmin = !(adminResult instanceof NextResponse);

  // Non-admin path: validate JWT and capture uid for ownership check
  let callerUid: string | null = null;
  if (!isAdmin) {
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    callerUid = user.id;
  }

  let body: {
    id?: string;
    name?: string;
    category?: string;
    zone?: string;
    baseText?: string;
    lat?: number;
    lng?: number;
    availabilityStart?: string;
    availabilityEnd?: string;
    schedule?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { id, name, category, zone, baseText, lat, lng, availabilityStart, availabilityEnd, schedule } = body;
  if (!id || !name || !category || !zone || lat == null || lng == null) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  // Ownership check: non-admin must own the business being updated
  if (!isAdmin) {
    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .select("auth_user_id")
      .eq("id", id)
      .maybeSingle();
    if (bizErr) return NextResponse.json({ error: bizErr.message }, { status: 500 });
    if (!biz) return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    if (biz.auth_user_id !== callerUid) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const updatePayload: Record<string, unknown> = {
    name,
    category,
    zone,
    description: baseText ?? zone,
    address: baseText ?? zone,
    lat,
    lng,
    opening_time: availabilityStart || null,
    closing_time: availabilityEnd || null,
  };

  if (schedule !== undefined) {
    updatePayload.schedule = schedule ?? null;
  }

  const { error } = await admin
    .from("businesses")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    // Columna schedule no existe aún (migración pendiente): reintento sin ella.
    if ((error as { code?: string }).code === "42703" && "schedule" in updatePayload) {
      console.warn("[update-profile] columna 'schedule' no existe. Aplica la migración. Guardando sin schedule.");
      const { schedule: _dropped, ...payloadWithoutSchedule } = updatePayload;
      void _dropped;
      const { error: e2 } = await admin.from("businesses").update(payloadWithoutSchedule).eq("id", id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      return NextResponse.json({ ok: true, schedulePending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
