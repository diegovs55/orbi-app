import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing Supabase service role key." },
      { status: 500 }
    );
  }

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    is_registered?: boolean;
    auth_user_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return NextResponse.json({ error: "phone is required." }, { status: 400 });
  }


  const now = new Date().toISOString();

  // Fetch existing row to preserve counters, timestamps, and auth link
  const { data: existing } = await supabaseAdmin
    .from("customers")
    .select("id, created_at, last_order_at, total_orders, total_spent, is_registered, auth_user_id")
    .eq("phone", phone)
    .maybeSingle();

  const id = existing?.id ?? crypto.randomUUID();
  const isRegistered = body.is_registered ?? existing?.is_registered ?? false;
  // Preserve existing auth_user_id unless a new one is provided
  const authUserId = body.auth_user_id ?? existing?.auth_user_id ?? null;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .upsert(
      {
        id,
        name: body.name?.trim() ?? "",
        phone,
        email: body.email?.trim() || null,
        is_registered: isRegistered,
        auth_user_id: authUserId,
        status: "activo",
        // Preserve existing counters — never reset them on login/register
        total_orders: existing?.total_orders ?? 0,
        total_spent: existing?.total_spent ?? 0,
        last_order_at: existing?.last_order_at ?? now,
        // Preserve original creation date; only update updated_at
        created_at: existing?.created_at ?? now,
        updated_at: now,
      },
      { onConflict: "phone" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/customers/upsert] error:", error.message, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data });
}
