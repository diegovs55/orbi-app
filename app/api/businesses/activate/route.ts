import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword, assertAdminJWT } from "@/lib/supabase-admin";



export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let businessId: string;
  try {
    const body = (await req.json()) as { businessId?: string };
    businessId = body.businessId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required." }, { status: 400 });
  }

  const { data: business, error: bizError } = await admin
    .from("businesses")
    .select("id,name,email,phone,auth_user_id")
    .eq("id", businessId)
    .maybeSingle();

  if (bizError || !business) {
    return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
  }

  const bizRow = business as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    auth_user_id: string | null;
  };

  const email = bizRow.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "El negocio no tiene correo registrado." }, { status: 422 });
  }

  if (bizRow.auth_user_id) {
    return NextResponse.json({ alreadyActivated: true, email, businessId });
  }

  const tempPassword = generateTempPassword();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
      business_id: businessId,
      name: bizRow.name,
    },
  });

  if (authError || !authData.user) {
    console.error("[businesses/activate] createUser error:", authError?.message);
    return NextResponse.json(
      { error: authError?.message ?? "No fue posible crear el usuario en Supabase Auth." },
      { status: 500 }
    );
  }

  const authUserId = authData.user.id;

  const { error: updateError } = await admin
    .from("businesses")
    .update({ auth_user_id: authUserId })
    .eq("id", businessId);

  if (updateError) {
    console.error("[businesses/activate] update error:", updateError.message);
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json(
      { error: "No fue posible vincular el usuario con la ficha del negocio." },
      { status: 500 }
    );
  }

  return NextResponse.json({ email, tempPassword, businessId, authUserId });
}
