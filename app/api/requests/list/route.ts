import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


export async function GET() {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const { data, error } = await admin
    .from("requests")
    .select("id,type,status,name,email,phone,message,created_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[api/requests/list]", error?.message);
    return NextResponse.json({ error: "Failed to fetch requests." }, { status: 500 });
  }

  return NextResponse.json(data);
}
