import { NextRequest, NextResponse } from "next/server";
import { getAdmin, generateTempPassword, assertAdminJWT } from "@/lib/supabase-admin";

const BUSINESS_SELECT = "id,email,name,auth_user_id,status";

const BUSINESS_DEFAULTS = {
  category: "Otro",
  zone: "",
  address: "",
  status: "activo",
  rating: null,
  opening_time: "",
  closing_time: "",
  lat: null,
  lng: null,
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
    .select("id,type,name,email,phone,message,status")
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
    message: string | null;
    status: string;
  };

  // ── 4. Confirmar tipo ──────────────────────────────────────────────────────
  if (req_.type !== "business") {
    return NextResponse.json(
      { error: `Esta solicitud es de tipo "${req_.type}", no "business".` },
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

  // ── 5b. Idempotencia por estado de solicitud ───────────────────────────────
  // Si la solicitud ya fue aprobada, no crear nada nuevo. Devolver el negocio
  // vinculado si existe, o alreadyActivated:true de todas formas.
  if (req_.status === "approved") {
    const { data: linkedRows } = await admin
      .from("businesses")
      .select("id,auth_user_id")
      .eq("email", email)
      .not("auth_user_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1);
    const linked = ((linkedRows ?? []) as { id: string; auth_user_id: string | null }[])[0];
    return NextResponse.json({
      alreadyActivated: true,
      email,
      businessId: linked?.id,
      authUserId: linked?.auth_user_id,
    });
  }

  // ── 6. Buscar filas existentes en businesses para este email ───────────────
  const { data: businessRows, error: businessFetchError } = await admin
    .from("businesses")
    .select(BUSINESS_SELECT)
    .eq("email", email)
    .order("created_at", { ascending: true });

  if (businessFetchError) {
    console.error("[businesses/approve] error buscando negocios:", businessFetchError.message);
    return NextResponse.json({ error: "Error al consultar la base de datos." }, { status: 500 });
  }

  type BusinessRow = { id: string; email: string | null; name: string; auth_user_id: string | null; status: string | null };
  let allRows = (businessRows ?? []) as BusinessRow[];

  // ── 6b. Fallback por nombre (registros históricos con email nulo o distinto) ─
  if (allRows.length === 0) {
    const { data: nameRows } = await admin
      .from("businesses")
      .select(BUSINESS_SELECT)
      .ilike("name", req_.name.trim())
      .order("created_at", { ascending: true });
    if (nameRows && nameRows.length > 0) {
      allRows = nameRows as BusinessRow[];
      console.warn(
        `[businesses/approve] email search vacío; ${allRows.length} fila(s) encontrada(s) por nombre "${req_.name}".`
      );
    }
  }

  const activatedRows = allRows.filter((r) => r.auth_user_id !== null);
  const orphanRows    = allRows.filter((r) => r.auth_user_id === null);

  // ── 7. Rama: ambigüedad irrecuperable ─────────────────────────────────────
  if (activatedRows.length > 1) {
    console.error(
      `[businesses/approve] ambigüedad: ${activatedRows.length} filas con auth_user_id para email="${email}". requestId=${requestId}`
    );
    return NextResponse.json(
      {
        error:
          "Existen múltiples fichas de negocio ya vinculadas para este correo. " +
          "La aprobación automática no es posible. Requiere revisión manual.",
      },
      { status: 409 }
    );
  }

  // ── 8. Rama: ya completamente activado ────────────────────────────────────
  if (activatedRows.length === 1) {
    const already = activatedRows[0];

    if (req_.status !== "approved") {
      await admin
        .from("requests")
        .update({ status: "approved" })
        .eq("id", requestId);
    }

    return NextResponse.json({
      alreadyActivated: true,
      email,
      businessId: already.id,
      authUserId: already.auth_user_id,
    });
  }

  // ── 9. Determinar businessId: reutilizar huérfano o crear fila nueva ───────
  let businessId: string;

  if (orphanRows.length >= 1) {
    // Priorizar activo > inactivo > eliminado; dentro del mismo status, el más antiguo.
    const STATUS_PRIORITY: Record<string, number> = { activo: 0, inactivo: 1, eliminado: 2 };
    const bestOrphan = [...orphanRows].sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status ?? ""] ?? 3;
      const pb = STATUS_PRIORITY[b.status ?? ""] ?? 3;
      return pa - pb; // created_at order ya fue establecido por la query (ASC)
    })[0];
    if (orphanRows.length > 1) {
      console.warn(
        `[businesses/approve] ${orphanRows.length} filas huérfanas para email="${email}". ` +
          `Se reutiliza id="${bestOrphan.id}" (status="${bestOrphan.status}"). Las demás son residuo histórico.`
      );
    }
    businessId = bestOrphan.id;
  } else {
    const insertPayload = {
      name: req_.name,
      email,
      phone: req_.phone,
      description: req_.message ?? req_.name,
      ...BUSINESS_DEFAULTS,
    };

    const { error: insertError } = await admin.from("businesses").insert(insertPayload);
    if (insertError) {
      console.error("[businesses/approve] error al insertar negocio:", insertError.message);
      return NextResponse.json(
        { error: "No fue posible crear la ficha del negocio." },
        { status: 500 }
      );
    }

    const { data: newRow, error: readError } = await admin
      .from("businesses")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError || !newRow) {
      console.error("[businesses/approve] error al leer negocio recién creado:", readError?.message);
      return NextResponse.json(
        { error: "Ficha creada pero no fue posible leerla. Reintenta." },
        { status: 500 }
      );
    }

    businessId = (newRow as { id: string }).id;
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
      business_id: businessId,
      name: req_.name,
    },
  });

  if (!authError) {
    authUserId = authData.user.id;
    passwordWasCreated = true;
  } else {
    const msg = authError.message?.toLowerCase() ?? "";
    const isAlreadyRegistered =
      msg.includes("already been registered") ||
      msg.includes("already registered") ||
      msg.includes("user already exists");

    if (!isAlreadyRegistered) {
      console.error("[businesses/approve] createUser error inesperado:", authError.message);
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
      console.error("[businesses/approve] error al listar usuarios Auth:", listError?.message);
      return NextResponse.json(
        { error: "No fue posible recuperar el usuario existente en Supabase Auth." },
        { status: 500 }
      );
    }

    const matchingAuthUsers = listData.users.filter(
      (u) => (u.email ?? "").toLowerCase() === email
    );

    if (matchingAuthUsers.length === 0) {
      console.error(`[businesses/approve] email "${email}" reportado como registrado pero no encontrado en listUsers.`);
      return NextResponse.json(
        { error: "Estado inconsistente en Supabase Auth. Contacta soporte." },
        { status: 500 }
      );
    }

    if (matchingAuthUsers.length > 1) {
      console.error(`[businesses/approve] múltiples usuarios Auth para email="${email}".`);
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
    passwordWasCreated = false;

    // Confirmar el email del usuario preexistente si aún no estaba confirmado.
    // Un admin que aprueba sustituye la confirmación por correo.
    if (!matchingAuthUsers[0].email_confirmed_at) {
      await admin.auth.admin.updateUserById(authUserId, { email_confirm: true }).catch((e: unknown) => {
        console.warn("[businesses/approve] no se pudo confirmar email del usuario preexistente:", e);
      });
    }

    // ── 10b. Verificar que este auth_user_id no esté vinculado a OTRO negocio ─
    const { data: conflictRow, error: conflictError } = await admin
      .from("businesses")
      .select("id,email")
      .eq("auth_user_id", authUserId)
      .neq("id", businessId)
      .maybeSingle();

    if (conflictError) {
      console.error("[businesses/approve] error verificando conflicto auth_user_id:", conflictError.message);
      return NextResponse.json({ error: "Error al verificar conflictos de identidad." }, { status: 500 });
    }

    if (conflictRow) {
      const conflict = conflictRow as { id: string; email: string | null };
      console.error(
        `[businesses/approve] auth_user_id="${authUserId}" ya está vinculado al negocio id="${conflict.id}" (email="${conflict.email}"). ` +
          `No se vinculará al negocio id="${businessId}".`
      );
      return NextResponse.json(
        {
          error:
            "El usuario de Supabase Auth para este correo ya está vinculado a otro negocio. " +
            "Requiere revisión manual.",
        },
        { status: 409 }
      );
    }
  }

  // ── 11. Vincular auth_user_id en la fila del negocio ──────────────────────
  const { error: updateError } = await admin
    .from("businesses")
    .update({ auth_user_id: authUserId })
    .eq("id", businessId);

  if (updateError) {
    console.error("[businesses/approve] error al vincular auth_user_id:", updateError.message);
    if (passwordWasCreated) {
      await admin.auth.admin.deleteUser(authUserId).catch((e: unknown) => {
        console.error("[businesses/approve] compensación deleteUser falló:", e);
      });
    }
    return NextResponse.json(
      { error: "No fue posible vincular el usuario con la ficha del negocio." },
      { status: 500 }
    );
  }

  // ── 12. Marcar la solicitud como aprobada ──────────────────────────────────
  const { error: approveError } = await admin
    .from("requests")
    .update({ status: "approved" })
    .eq("id", requestId);

  if (approveError) {
    console.error(
      "[businesses/approve] vínculo OK pero PATCH de requests falló:",
      approveError.message
    );
  }

  // ── 13. Respuesta ──────────────────────────────────────────────────────────
  return NextResponse.json(
    {
      email,
      businessId,
      authUserId,
      ...(passwordWasCreated ? { tempPassword } : {}),
    },
    { status: 201 }
  );
}
