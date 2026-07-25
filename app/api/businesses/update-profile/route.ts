import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


export async function PATCH(req: NextRequest) {
  // Note: called by both admin panel and authenticated business users.
  // Full per-owner auth check is tracked as a future sprint item.
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

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
