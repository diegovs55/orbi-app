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
  const incomingAuthUserId =
    typeof body.auth_user_id === "string" && body.auth_user_id.trim()
      ? body.auth_user_id.trim()
      : null;
  const incomingEmail = body.email?.trim().toLowerCase() || null;

  // Lookup priority: auth_user_id → email → phone.
  // This prevents duplicate customer rows when the same Supabase Auth user
  // registers again with a different phone number.
  let existing: {
    id: string;
    created_at: string | null;
    last_order_at: string | null;
    total_orders: number | null;
    total_spent: number | null;
    is_registered: boolean | null;
    auth_user_id: string | null;
  } | null = null;

  if (incomingAuthUserId) {
    const { data } = await supabaseAdmin
      .from("customers")
      .select("id, created_at, last_order_at, total_orders, total_spent, is_registered, auth_user_id")
      .eq("auth_user_id", incomingAuthUserId)
      .maybeSingle();
    existing = data ?? null;
  }

  if (!existing && incomingEmail) {
    const { data } = await supabaseAdmin
      .from("customers")
      .select("id, created_at, last_order_at, total_orders, total_spent, is_registered, auth_user_id")
      .eq("email", incomingEmail)
      .maybeSingle();
    existing = data ?? null;
  }

  if (!existing) {
    const { data } = await supabaseAdmin
      .from("customers")
      .select("id, created_at, last_order_at, total_orders, total_spent, is_registered, auth_user_id")
      .eq("phone", phone)
      .maybeSingle();
    existing = data ?? null;
  }

  const id = existing?.id ?? crypto.randomUUID();
  const isRegistered = body.is_registered ?? existing?.is_registered ?? false;
  // Prefer the existing DB value; accept a new value from the body only when the
  // existing row has none (registration flow linking a fresh Supabase Auth user).
  const authUserId =
    existing?.auth_user_id ??
    incomingAuthUserId;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .upsert(
      {
        id,
        name: body.name?.trim() ?? "",
        phone,
        email: incomingEmail,
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
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[api/customers/upsert] error:", error.message, error.details);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ customer: data });
}
