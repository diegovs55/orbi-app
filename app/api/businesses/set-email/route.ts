import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";


export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let businessId: string;
  let email: string;
  try {
    const body = (await req.json()) as { businessId?: string; email?: string };
    businessId = body.businessId?.trim() ?? "";
    email = body.email?.trim().toLowerCase() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!businessId || !email) {
    return NextResponse.json({ error: "businessId and email are required." }, { status: 400 });
  }

  const { error } = await admin
    .from("businesses")
    .update({ email })
    .eq("id", businessId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
