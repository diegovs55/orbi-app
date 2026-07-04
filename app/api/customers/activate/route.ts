import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword } from "@/lib/supabase-admin";



export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let customerId: string;
  try {
    const body = (await req.json()) as { customerId?: string };
    customerId = body.customerId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }

  const { data: customer, error: custError } = await admin
    .from("customers")
    .select("id,name,email,phone,auth_user_id")
    .eq("id", customerId)
    .maybeSingle();

  if (custError || !customer) {
    return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  const row = customer as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    auth_user_id: string | null;
  };

  const email = row.email?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "El cliente no tiene correo registrado." },
      { status: 422 }
    );
  }

  if (row.auth_user_id) {
    return NextResponse.json({ alreadyActivated: true, email, customerId });
  }

  const tempPassword = generateTempPassword();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
      customer_id: customerId,
      name: row.name,
      phone: row.phone ?? "",
    },
  });

  if (authError || !authData.user) {
    console.error("[customers/activate] createUser error:", authError?.message);
    return NextResponse.json(
      { error: authError?.message ?? "No fue posible crear el usuario en Supabase Auth." },
      { status: 500 }
    );
  }

  const authUserId = authData.user.id;

  const { error: updateError } = await admin
    .from("customers")
    .update({ auth_user_id: authUserId })
    .eq("id", customerId);

  if (updateError) {
    console.error("[customers/activate] update error:", updateError.message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json(
      { error: "No fue posible vincular el usuario con el cliente." },
      { status: 500 }
    );
  }

  return NextResponse.json({ email, tempPassword, customerId, authUserId });
}
