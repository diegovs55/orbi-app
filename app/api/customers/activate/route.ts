import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword, assertAdminJWT } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

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

  // Already linked. If must_change_password was incorrectly set (e.g. by a previous
  // rescue attempt on a self-registered user), clear it so the user can log in normally.
  if (row.auth_user_id) {
    const { data: authUser } = await admin.auth.admin.getUserById(row.auth_user_id);
    if (authUser?.user?.user_metadata?.must_change_password) {
      const { must_change_password: _drop, ...cleanMeta } = authUser.user.user_metadata as Record<string, unknown> & { must_change_password?: boolean };
      await admin.auth.admin.updateUserById(row.auth_user_id, {
        user_metadata: cleanMeta,
      }).catch(() => undefined);
    }
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

  // Happy path: new Auth user created successfully.
  if (!authError && authData?.user) {
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

  // Auth user already exists in Supabase Auth (registered via the customer wizard).
  // Locate the existing Auth user and safely link it — only if it is not already
  // owned by a different customer row.
  const isEmailTaken =
    authError?.message?.includes("already been registered") ||
    authError?.message?.includes("already exists") ||
    authError?.status === 422;

  if (!isEmailTaken) {
    console.error("[customers/activate] createUser error:", authError?.message);
    return NextResponse.json(
      { error: authError?.message ?? "No fue posible crear el usuario en Supabase Auth." },
      { status: 500 }
    );
  }

  // Find the existing Auth user by email.
  const { data: listData, error: listError } = await admin.auth.admin.listUsers();
  if (listError) {
    return NextResponse.json(
      { error: "No fue posible verificar el usuario existente en Auth." },
      { status: 500 }
    );
  }

  const existingAuthUser = listData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!existingAuthUser) {
    return NextResponse.json(
      { error: "El correo ya existe en Auth pero no fue posible localizarlo." },
      { status: 500 }
    );
  }

  // Safety check: ensure this Auth user is not already linked to a different customer.
  const { data: otherCustomer, error: otherError } = await admin
    .from("customers")
    .select("id")
    .eq("auth_user_id", existingAuthUser.id)
    .neq("id", customerId)
    .maybeSingle();

  if (otherError) {
    return NextResponse.json(
      { error: "No fue posible verificar la propiedad del usuario." },
      { status: 500 }
    );
  }

  if (otherCustomer) {
    return NextResponse.json(
      { error: "El correo ya está vinculado a otro cliente en el sistema." },
      { status: 409 }
    );
  }

  // Safe to link. Update customers row and reset must_change_password metadata.
  const { error: updateError } = await admin
    .from("customers")
    .update({ auth_user_id: existingAuthUser.id })
    .eq("id", customerId);

  if (updateError) {
    return NextResponse.json(
      { error: "No fue posible vincular el usuario existente con el cliente." },
      { status: 500 }
    );
  }

  // This user self-registered — they already have their own password.
  // Only update metadata fields that don't affect login (do NOT set must_change_password).
  await admin.auth.admin.updateUserById(existingAuthUser.id, {
    user_metadata: {
      ...existingAuthUser.user_metadata,
      customer_id: customerId,
      name: row.name,
      phone: row.phone ?? "",
    },
  }).catch(() => undefined);

  // No tempPassword — user already knows their own credentials.
  return NextResponse.json({ email, customerId, authUserId: existingAuthUser.id, selfRegistered: true });
}
