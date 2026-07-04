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
    .select("id,name,email,auth_user_id")
    .eq("id", businessId)
    .maybeSingle();

  if (bizError || !business) {
    return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
  }

  const bizRow = business as {
    id: string;
    name: string;
    email: string | null;
    auth_user_id: string | null;
  };

  if (!bizRow.auth_user_id) {
    return NextResponse.json(
      { error: "El negocio aún no tiene acceso activo. Usa 'Activar acceso' primero." },
      { status: 422 }
    );
  }

  const tempPassword = generateTempPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(
    bizRow.auth_user_id,
    {
      password: tempPassword,
      user_metadata: { must_change_password: true },
    }
  );

  if (updateError) {
    console.error("[businesses/reset-access] updateUserById error:", updateError.message);
    return NextResponse.json(
      { error: updateError.message ?? "No fue posible restablecer el acceso." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    email: bizRow.email,
    tempPassword,
    businessId,
  });
}
