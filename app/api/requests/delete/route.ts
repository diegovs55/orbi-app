import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


export async function DELETE(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const { error } = await admin.from("requests").delete().eq("id", id);

  if (error) {
    console.error("[api/requests/delete]", error.message);
    return NextResponse.json({ error: "Failed to delete request." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
