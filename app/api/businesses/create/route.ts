import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let body: {
    name?: string;
    category?: string;
    zone?: string;
    baseText?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
    status?: string;
    availability?: string;
    availabilityStart?: string;
    availabilityEnd?: string;
    estimatedTime?: string;
    rating?: number | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const parsedRating = (() => {
    if (body.rating == null) return null;
    const n = Number(body.rating);
    return Number.isFinite(n) ? n : null;
  })();

  const payload = {
    name,
    category: body.category ?? "Otro",
    description: body.baseText || `${body.category ?? "Otro"} en ${body.zone ?? ""}`,
    zone: body.zone ?? "",
    address: body.baseText ?? "",
    phone: body.phone ?? "",
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    status: body.status === "activo" ? "activo" : "inactivo",
    rating: parsedRating,
    opening_time: body.availabilityStart ?? "",
    closing_time: body.availabilityEnd ?? "",
  };

  const { data, error } = await admin
    .from("businesses")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[businesses/create] insert error:", error?.message);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear la ficha del negocio." },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}
