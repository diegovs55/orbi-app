import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword, assertAdminJWT } from "@/lib/supabase-admin";



export async function POST(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let agentId: string;
  try {
    const body = (await req.json()) as { agentId?: string };
    agentId = body.agentId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required." }, { status: 400 });
  }

  // Fetch agent profile
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id,name,email,phone,auth_user_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) {
    return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });
  }

  const agentRow = agent as {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    auth_user_id: string | null;
  };

  const email = agentRow.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "El agente no tiene correo registrado." }, { status: 422 });
  }

  // Idempotent: already activated
  if (agentRow.auth_user_id) {
    return NextResponse.json({ alreadyActivated: true, email, agentId });
  }

  const tempPassword = generateTempPassword();

  // Create Supabase Auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
      agent_id: agentId,
      name: agentRow.name,
    },
  });

  if (authError || !authData.user) {
    console.error("[agents/activate] createUser error:", authError?.message);
    return NextResponse.json(
      { error: authError?.message ?? "No fue posible crear el usuario en Supabase Auth." },
      { status: 500 }
    );
  }

  const authUserId = authData.user.id;

  // Link auth user to agent profile
  const { error: updateError } = await admin
    .from("agents")
    .update({ auth_user_id: authUserId })
    .eq("id", agentId);

  if (updateError) {
    console.error("[agents/activate] update error:", updateError.message);
    // Best-effort cleanup so we don't leave an orphaned Auth user
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    return NextResponse.json(
      { error: "No fue posible vincular el usuario con la ficha del agente." },
      { status: 500 }
    );
  }

  return NextResponse.json({ email, tempPassword, agentId, authUserId });
}
