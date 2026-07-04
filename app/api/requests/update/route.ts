import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";


export async function PATCH(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const body = await req.json() as { id?: string; status?: string };
  const { id, status } = body;

  if (!id || !status || !["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { error } = await admin
    .from("requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[api/requests/update]", error.message);
    return NextResponse.json({ error: "Failed to update request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
