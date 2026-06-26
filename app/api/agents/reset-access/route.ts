import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

function getAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function POST(req: NextRequest) {
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

  // Fetch agent — needs auth_user_id to already exist
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("id,name,email,auth_user_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) {
    return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });
  }

  const agentRow = agent as {
    id: string;
    name: string;
    email: string | null;
    auth_user_id: string | null;
  };

  if (!agentRow.auth_user_id) {
    return NextResponse.json(
      { error: "El agente aún no tiene acceso activo. Usa 'Activar acceso' primero." },
      { status: 422 }
    );
  }

  const tempPassword = generateTempPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(
    agentRow.auth_user_id,
    {
      password: tempPassword,
      user_metadata: { must_change_password: true },
    }
  );

  if (updateError) {
    console.error("[agents/reset-access] updateUserById error:", updateError.message);
    return NextResponse.json(
      { error: updateError.message ?? "No fue posible restablecer el acceso." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    email: agentRow.email,
    tempPassword,
    agentId,
  });
}
