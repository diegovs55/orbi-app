import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();

  // Fetch existing row to preserve counters and timestamps
  const { data: existing } = await supabaseAdmin
    .from("customers")
    .select("id, created_at, last_order_at, total_orders, total_spent, is_registered")
    .eq("phone", phone)
    .maybeSingle();

  const id = existing?.id ?? crypto.randomUUID();
  const isRegistered = body.is_registered ?? existing?.is_registered ?? false;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .upsert(
      {
        id,
        name: body.name?.trim() ?? "",
        phone,
        email: body.email?.trim() || null,
        is_registered: isRegistered,
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
