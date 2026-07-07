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
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { id, name, category, zone, baseText, lat, lng, availabilityStart, availabilityEnd } = body;
  if (!id || !name || !category || !zone || lat == null || lng == null) {
    return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
  }

  const { error } = await admin
    .from("businesses")
    .update({
      name,
      category,
      zone,
      description: baseText ?? zone,
      address: baseText ?? zone,
      lat,
      lng,
      opening_time: availabilityStart || null,
      closing_time: availabilityEnd || null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
