import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword, assertAdminJWT } from "@/lib/supabase-admin";

// Columnas mínimas necesarias para el flujo de activación.
const AGENT_SELECT = "id,email,name,auth_user_id";

// Defaults aplicados al crear una fila nueva de agente server-side.
// Idénticos a los que usaba createAgent() en AdminPendingRequests antes de este cambio.
const AGENT_DEFAULTS = {
  photo_url: null,
  initials: null,
  service_type: "Todos los servicios",
  zone: "Por definir",
  status: "Disponible",
  is_on_orbit: false,
  trust_level: "Aprendiz",
  description: "",
  vehicle: null,
  availability: null,
  lat: null,
  lng: null,
  current_lat: null,
  current_lng: null,
  radius_km: 20,
  auth_user_id: null,
} as const;

export async function POST(req: NextRequest) {
  // ── 1. Autenticación y autorización ────────────────────────────────────────
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  // ── 2. Leer y validar body ─────────────────────────────────────────────────
  let requestId: string;
  try {
    const body = (await req.json()) as { requestId?: string };
    requestId = body.requestId?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  // ── 3. Leer la solicitud (fuente de verdad) ────────────────────────────────
  const { data: requestRow, error: requestError } = await admin
    .from("requests")
    .select("id,type,name,email,phone,status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  }

  const req_ = requestRow as {
    id: string;
    type: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  };

  // ── 4. Confirmar tipo ──────────────────────────────────────────────────────
  if (req_.type !== "agent") {
    return NextResponse.json(
      { error: `Esta solicitud es de tipo "${req_.type}", no "agent".` },
      { status: 422 }
    );
  }

  // ── 5. Validar y normalizar email ──────────────────────────────────────────
  const email = req_.email?.trim().toLowerCase() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: `Email inválido en la solicitud: "${req_.email}".` },
      { status: 422 }
    );
  }

  // ── 6. Buscar filas existentes en agents para este email ───────────────────
  const { data: agentRows, error: agentFetchError } = await admin
    .from("agents")
    .select(AGENT_SELECT)
    .eq("email", email)
    .order("created_at", { ascending: true }); // la más antigua es la canónica

  if (agentFetchError) {
    console.error("[agents/activate] error buscando agentes:", agentFetchError.message);
    return NextResponse.json({ error: "Error al consultar la base de datos." }, { status: 500 });
  }

  type AgentRow = { id: string; email: string | null; name: string; auth_user_id: string | null };
  const rows = (agentRows ?? []) as AgentRow[];

  // Clasificar filas por estado de vínculo
  const activatedRows = rows.filter((r) => r.auth_user_id !== null);
  const orphanRows    = rows.filter((r) => r.auth_user_id === null);

  // ── 7. Rama: ambigüedad irrecuperable ─────────────────────────────────────
  // Más de una fila ya vinculada → detenerse.
  if (activatedRows.length > 1) {
    console.error(
      `[agents/activate] ambigüedad: ${activatedRows.length} filas con auth_user_id para email="${email}". requestId=${requestId}`
    );
    return NextResponse.json(
      {
        error:
          "Existen múltiples fichas de agente ya vinculadas para este correo. " +
          "La activación automática no es posible. Requiere revisión manual.",
      },
      { status: 409 }
    );
  }

  // ── 8. Rama: ya completamente activado ────────────────────────────────────
  // Exactamente una fila con auth_user_id → idempotente.
  if (activatedRows.length === 1) {
    const already = activatedRows[0];

    // Marcar la solicitud como aprobada si no lo estaba (idempotente)
    if (req_.status !== "approved") {
      await admin
        .from("requests")
        .update({ status: "approved" })
        .eq("id", requestId);
    }

    return NextResponse.json({
      alreadyActivated: true,
      email,
      agentId: already.id,
      authUserId: already.auth_user_id,
    });
  }

  // ── 9. Determinar agentId: reutilizar huérfano o crear fila nueva ──────────
  let agentId: string;

  if (orphanRows.length >= 1) {
    // Reutilizar la fila huérfana más antigua (determinístico).
    // Si hay más de una, es residuo histórico — se loguea pero no se limpia.
    if (orphanRows.length > 1) {
      console.warn(
        `[agents/activate] ${orphanRows.length} filas huérfanas para email="${email}". ` +
          "Se reutiliza la más antigua. Las demás son residuo histórico."
      );
    }
    agentId = orphanRows[0].id;
  } else {
    // No existe ninguna fila — crear server-side.
    const insertPayload = {
      name: req_.name,
      email,
      phone: req_.phone,
      ...AGENT_DEFAULTS,
    };

    const { error: insertError } = await admin.from("agents").insert(insertPayload);
    if (insertError) {
      console.error("[agents/activate] error al insertar agente:", insertError.message);
      return NextResponse.json(
        { error: "No fue posible crear la ficha del agente." },
        { status: 500 }
      );
    }

    // Leer el id de la fila recién creada.
    const { data: newRow, error: readError } = await admin
      .from("agents")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError || !newRow) {
      console.error("[agents/activate] error al leer agente recién creado:", readError?.message);
      return NextResponse.json(
        { error: "Ficha creada pero no fue posible leerla. Reintenta." },
        { status: 500 }
      );
    }

    agentId = (newRow as { id: string }).id;
  }

  // ── 10. Crear o recuperar usuario en Supabase Auth ─────────────────────────
  const tempPassword = generateTempPassword();
  let authUserId: string;
  let passwordWasCreated = false;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      must_change_password: true,
      agent_id: agentId,
      name: req_.name,
    },
  });

  if (!authError) {
    // Usuario creado exitosamente.
    authUserId = authData.user.id;
    passwordWasCreated = true;
  } else {
    // Verificar si el error es por email ya registrado.
    const msg = authError.message?.toLowerCase() ?? "";
    const isAlreadyRegistered =
      msg.includes("already been registered") ||
      msg.includes("already registered") ||
      msg.includes("user already exists");

    if (!isAlreadyRegistered) {
      console.error("[agents/activate] createUser error inesperado:", authError.message);
      return NextResponse.json(
        { error: authError.message ?? "No fue posible crear el usuario en Supabase Auth." },
        { status: 500 }
      );
    }

    // Email ya registrado → recuperar usuario existente.
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError || !listData) {
      console.error("[agents/activate] error al listar usuarios Auth:", listError?.message);
      return NextResponse.json(
        { error: "No fue posible recuperar el usuario existente en Supabase Auth." },
        { status: 500 }
      );
    }

    const matchingAuthUsers = listData.users.filter(
      (u) => (u.email ?? "").toLowerCase() === email
    );

    if (matchingAuthUsers.length === 0) {
      console.error(`[agents/activate] email "${email}" reportado como registrado pero no encontrado en listUsers.`);
      return NextResponse.json(
        { error: "Estado inconsistente en Supabase Auth. Contacta soporte." },
        { status: 500 }
      );
    }

    if (matchingAuthUsers.length > 1) {
      console.error(`[agents/activate] múltiples usuarios Auth para email="${email}".`);
      return NextResponse.json(
        {
          error:
            "Existen múltiples usuarios en Supabase Auth para este correo. " +
            "Requiere revisión manual.",
        },
        { status: 409 }
      );
    }

    authUserId = matchingAuthUsers[0].id;
    passwordWasCreated = false; // el usuario ya tenía contraseña; no la exponemos

    // ── 10b. Verificar que este auth_user_id no esté vinculado a OTRO agente ──
    const { data: conflictRow, error: conflictError } = await admin
      .from("agents")
      .select("id,email")
      .eq("auth_user_id", authUserId)
      .neq("id", agentId) // excluir el agente que estamos activando
      .maybeSingle();

    if (conflictError) {
      console.error("[agents/activate] error verificando conflicto auth_user_id:", conflictError.message);
      return NextResponse.json({ error: "Error al verificar conflictos de identidad." }, { status: 500 });
    }

    if (conflictRow) {
      const conflict = conflictRow as { id: string; email: string | null };
      console.error(
        `[agents/activate] auth_user_id="${authUserId}" ya está vinculado al agente id="${conflict.id}" (email="${conflict.email}"). ` +
          `No se vinculará al agente id="${agentId}".`
      );
      return NextResponse.json(
        {
          error:
            "El usuario de Supabase Auth para este correo ya está vinculado a otro agente. " +
            "Requiere revisión manual.",
        },
        { status: 409 }
      );
    }
  }

  // ── 11. Vincular auth_user_id en la fila del agente ───────────────────────
  const { error: updateError } = await admin
    .from("agents")
    .update({ auth_user_id: authUserId })
    .eq("id", agentId);

  if (updateError) {
    console.error("[agents/activate] error al vincular auth_user_id:", updateError.message);
    // Compensación: solo si el usuario fue recién creado en este request.
    if (passwordWasCreated) {
      await admin.auth.admin.deleteUser(authUserId).catch((e: unknown) => {
        console.error("[agents/activate] compensación deleteUser falló:", e);
      });
    }
    return NextResponse.json(
      { error: "No fue posible vincular el usuario con la ficha del agente." },
      { status: 500 }
    );
  }

  // ── 12. Marcar la solicitud como aprobada ──────────────────────────────────
  // Solo después de que el vínculo fue establecido correctamente.
  const { error: approveError } = await admin
    .from("requests")
    .update({ status: "approved" })
    .eq("id", requestId);

  if (approveError) {
    // El agente quedó activado. Loguear sin revertir — el estado es correcto.
    // El admin puede reintentar; el endpoint es idempotente.
    console.error(
      "[agents/activate] vínculo OK pero PATCH de requests falló:",
      approveError.message
    );
  }

  // ── 13. Respuesta ──────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      email,
      agentId,
      authUserId,
      ...(passwordWasCreated ? { tempPassword } : {}),
    },
    { status: 201 }
  );
}
