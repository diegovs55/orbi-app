/**
 * POST /api/missions/create
 *
 * Única autoridad para crear misiones y calcular sus valores financieros.
 * El servidor ignora cualquier campo financiero enviado por el cliente y
 * recalcula todos los valores desde cero.
 *
 * ── Autoridad del servidor ────────────────────────────────────────────────────
 *   subtotal_productos  — calculado sumando item.price × item.quantity
 *   service_fee         — calculado con lib/pricing desde coordenadas reales
 *   total_amount        — subtotal_productos + service_fee (catálogo) | service_fee (directa)
 *   costo_agente        — 70% del service_fee
 *   ganancia_orbi       — 30% del service_fee
 *   pricing_rule        — siempre PRICING_RULE del motor activo
 *
 * ── Principio de ignorancia activa ───────────────────────────────────────────
 *   Si el cliente envía service_fee, total_amount, costo_agente, ganancia_orbi
 *   o subtotal_productos, el servidor NO los lee, NO los valida, NO los compara.
 *   Simplemente los ignora. Los campos financieros del body del cliente no tienen
 *   ningún efecto sobre los valores persistidos. El servidor reconstruye la misión
 *   financiera desde cero usando únicamente coordenadas, ítems y lib/pricing.
 *   Esto no es validación con rechazo — es recálculo con reemplazo total.
 *
 * ── Inputs confiados del cliente ─────────────────────────────────────────────
 *   Coordenadas, identificadores (business_id, product_id, selected_agent_id),
 *   cantidades, datos del solicitante, método de pago, guest_id.
 *
 * ── Autoridad sobre productos (Fase 2 — implementada) ───────────────────────
 *   El cliente envía únicamente product_id y quantity por ítem.
 *   El servidor consulta public.catalog para obtener price, name, business_id
 *   y category de cada producto. Los campos item.price, item.product_name,
 *   item.subtotal y item.business_name enviados por el cliente son ignorados.
 *   Si algún product_id no existe en el catálogo, la creación es rechazada (404).
 *   Si los productos pertenecen a un business_id distinto al declarado, la
 *   creación es rechazada (422) — protege la integridad del carrito.
 *
 * ── Seguridad ─────────────────────────────────────────────────────────────────
 *   Usa SERVICE_ROLE_KEY — nunca exponer al cliente.
 *   No requiere RLS — la inserción es autorizada por el servidor.
 */

import { NextRequest, NextResponse } from "next/server";
import { calcularMisionCatalogo, PRICING_RULE } from "@/lib/pricing";
import { computeQuote, haversineKmServer, resolveDistanceServer, loadMotorParams } from "@/lib/pricing/server";
import { logEvent } from "@/lib/event-log";
import { getAdmin } from "@/lib/supabase-admin";
import { getRouteDistanceKm, RoutingError } from "@/lib/routing/server";

const CATALOG_SERVICE_TYPE = "Compra local";

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt    = Date.now();
  const requestId    = crypto.randomUUID();

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // ── Extraer campos requeridos ─────────────────────────────────────────────

  const {
    // Identidad de misión
    id,
    mission_type,
    service_type,
    status,
    detail,
    estimated_orbit,

    // Identidad del cliente
    guest_id,
    user_id,
    requester_name,
    requester_phone,
    customer_name,
    customer_phone,
    guest_name,
    guest_phone,

    // Geografía
    origin_text,
    origin_lat,
    origin_lng,
    destination_text,
    destination_lat,
    destination_lng,

    // Catálogo
    business_id,
    business_name,
    business_lat,
    business_lng,
    product_id,
    product_name,
    items,
    product_ids,

    // Agente
    selected_agent_id,
    selected_agent_name,
    selected_agent_zone,
    selected_agent_vehicle,
    selected_agent_trust,
    selected_agent_lat,
    selected_agent_lng,
    active_agent_id,

    // Pago
    payment_status,
    payment_method,

    // Metadata de ruta (hints del cliente — no financiero)
    distance_km: clientDistanceKm,
    duration_min,
    route_geometry,

    // Metadata adicional
    sector,
    categoria_producto,
    created_at,
    updated_at,
    accepted_at,
  } = body;

  // ── Validar campos requeridos ─────────────────────────────────────────────

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id es requerido." }, { status: 400 });
  }
  if (!requester_phone || typeof requester_phone !== "string") {
    return NextResponse.json({ error: "requester_phone es requerido." }, { status: 400 });
  }
  if (!service_type || typeof service_type !== "string") {
    return NextResponse.json({ error: "service_type es requerido." }, { status: 400 });
  }


  // El servidor deriva mission_type de los datos, no confía en el cliente.
  const clientItems = Array.isArray(items)
    ? (items as Array<{ product_id?: unknown; quantity?: unknown }>)
    : [];
  const isCatalog = clientItems.length > 0;

  // ── Distancia origin→destination ─────────────────────────────────────────

  const oLat = typeof origin_lat === "number" ? origin_lat : null;
  const oLng = typeof origin_lng === "number" ? origin_lng : null;
  const dLat = Number.isFinite(destination_lat) ? destination_lat as number : null;
  const dLng = Number.isFinite(destination_lng) ? destination_lng as number : null;

  // bLat/bLng: coordenadas autoritativas del negocio (G1 — resueltas desde DB para catálogo)
  let bLat: number | null = null;
  let bLng: number | null = null;

  let pricingDistanceKm: number | null = null;
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    const serverHaversine = haversineKmServer(oLat, oLng, dLat, dLng);
    pricingDistanceKm = resolveDistanceServer(
      typeof clientDistanceKm === "number" ? clientDistanceKm : null,
      serverHaversine
    );
  }

  // ── Campos financieros — el servidor es la única autoridad ───────────────

  let subtotalProductos: number | null = null;
  let serviceFee: number | null = null;
  let totalAmount: number = 0;
  let costoAgente: number = 0;
  let gananciaOrbi: number = 0;
  let motorParamsVersionForRow: number | null = null;

  // Ítems enriquecidos desde el catálogo (sustituyen completamente los del cliente)
  type AuthoritativeItem = {
    product_id: string;
    product_name: string;
    business_id: string;
    business_name: string;
    quantity: number;
    price: number;
    subtotal: number;
    category: string;
  };
  let authoritativeItems: AuthoritativeItem[] = [];

  if (isCatalog) {
    // Extraer los únicos datos confiables del cliente: product_id y quantity
    const clientLineItems = clientItems
      .map((item) => ({
        product_id: typeof item.product_id === "string" ? item.product_id : null,
        quantity:   typeof item.quantity   === "number" ? item.quantity   : 1,
      }))
      .filter((item): item is { product_id: string; quantity: number } =>
        item.product_id !== null && item.quantity > 0
      );

    if (clientLineItems.length === 0) {
      return NextResponse.json(
        { error: "La misión de catálogo requiere al menos un producto con product_id válido." },
        { status: 400 }
      );
    }

    // V6: no duplicate product_ids — viola regla de negocio → 422
    const productIds = clientLineItems.map((i) => i.product_id);
    if (new Set(productIds).size !== productIds.length) {
      return NextResponse.json(
        { error: "El carrito contiene productos duplicados." },
        { status: 422 }
      );
    }

    // Consultar precios y metadata desde public.products — fuente autoritativa
    const { data: catalogRows, error: catalogError } = await admin
      .from("products")
      .select("id, name, price, business_id, category, status, available")
      .in("id", productIds);

    if (catalogError) {
      console.error("[missions/create] Error al consultar catálogo:", catalogError);
      return NextResponse.json({ error: "Error al verificar productos." }, { status: 500 });
    }

    // Verificar que todos los product_ids existen en el catálogo
    const catalogMap = new Map(
      (catalogRows ?? []).map((row) => [row.id as string, row])
    );
    const missingIds = productIds.filter((pid) => !catalogMap.has(pid));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no encontrados en el catálogo: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }

    // Validar que todos los productos son vendibles: status='disponible' AND available=true.
    // Ejecutado antes de cualquier INSERT, ledger o intention_log.
    const notSellable = productIds.filter((pid) => {
      const row = catalogMap.get(pid);
      return !row || row.status !== "disponible" || row.available !== true;
    });
    if (notSellable.length > 0) {
      const labels = notSellable.map((pid) => {
        const row = catalogMap.get(pid);
        const reason =
          !row                             ? "no encontrado"           :
          row.status === "agotado"         ? "agotado temporalmente"   :
          row.status === "pausado"         ? "temporalmente no disponible" :
          row.status === "descontinuado"   ? "descontinuado"           :
                                             "no disponible";
        const name = row?.name ? `"${row.name}"` : `id ${pid}`;
        return `${name} (${reason})`;
      });
      const plural = labels.length === 1;
      await logEvent({
        event_type:   "api.create.error_422",
        severity:     "warn",
        source:       "api_route",
        entity_type:  "mission",
        entity_id:    id as string,
        actor_type:   "system",
        payload:      { reason: "products_not_sellable", product_ids: notSellable },
        http_status:  422,
        duration_ms:  Date.now() - startedAt,
        request_id:   requestId,
      });
      return NextResponse.json(
        {
          error: `${labels.join(", ")} ${plural ? "no está" : "no están"} disponible${plural ? "" : "s"} en este momento. Revisa el carrito e intenta de nuevo.`,
        },
        { status: 422 }
      );
    }

    // Verificar que todos los productos pertenecen al mismo business_id declarado
    const declaredBusinessId = typeof business_id === "string" ? business_id : null;
    if (!declaredBusinessId) {
      return NextResponse.json(
        { error: "business_id es requerido para misiones de catálogo." },
        { status: 400 }
      );
    }
    const wrongBusiness = productIds.filter((pid) => {
      const row = catalogMap.get(pid);
      return row && declaredBusinessId && row.business_id !== declaredBusinessId;
    });
    if (wrongBusiness.length > 0) {
      await logEvent({
        event_type:   "api.create.error_422",
        severity:     "warn",
        source:       "api_route",
        entity_type:  "mission",
        entity_id:    id as string,
        actor_type:   "system",
        payload:      { reason: "cart_business_mismatch", product_ids: wrongBusiness, declared_business_id: declaredBusinessId },
        http_status:  422,
        duration_ms:  Date.now() - startedAt,
        request_id:   requestId,
      });
      return NextResponse.json(
        {
          error:
            "Inconsistencia de carrito: uno o más productos no pertenecen al negocio declarado.",
          product_ids: wrongBusiness,
        },
        { status: 422 }
      );
    }

    // Construir ítems con datos autoritativos del servidor
    authoritativeItems = clientLineItems.map((lineItem) => {
      const row = catalogMap.get(lineItem.product_id)!;
      const price = typeof row.price === "number" ? row.price : Number(row.price) || 0;
      return {
        product_id:    lineItem.product_id,
        product_name:  (row.name as string) || "",
        business_id:   (row.business_id as string) || "",
        business_name: (business_name as string | null) ?? "",  // se enriquece en Fase 3 desde public.businesses
        quantity:      lineItem.quantity,
        price,
        subtotal:      Math.round(price * lineItem.quantity * 100) / 100,
        category:      (row.category as string) || "",
      };
    });

    // subtotal_productos desde precios autoritativos del servidor
    subtotalProductos = Math.round(
      authoritativeItems.reduce((sum, item) => sum + item.subtotal, 0) * 100
    ) / 100;

    // S1 (G1): Resolver coordenadas del negocio desde DB — nunca confiar en GPS del cliente
    const { data: bizRow, error: bizError } = await admin
      .from("businesses")
      .select("lat, lng")
      .eq("id", declaredBusinessId)
      .single();
    if (bizError || !bizRow) {
      return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    }
    const bizLat = Number(bizRow.lat);
    const bizLng = Number(bizRow.lng);
    if (!Number.isFinite(bizLat) || !Number.isFinite(bizLng)) {
      return NextResponse.json(
        { error: "El negocio no tiene coordenadas geográficas válidas." },
        { status: 422 }
      );
    }
    bLat = bizLat;
    bLng = bizLng;

    // S2 (G1.1): Distancia vial autoritativa negocio→destino — misma fuente que /api/pricing/quote
    if (dLat != null && dLng != null) {
      try {
        const routeResult = await getRouteDistanceKm(bLat, bLng, dLat, dLng);
        pricingDistanceKm = routeResult.distance_km;
      } catch (err) {
        const code = err instanceof RoutingError ? err.code : "ROUTING_UNAVAILABLE";
        const osrmO = err instanceof RoutingError ? err.osrmOutcome : "provider_error";
        const orsO  = err instanceof RoutingError ? err.orsOutcome  : "provider_error";
        await logEvent({
          event_type:   "api.create.error_routing",
          severity:     "warn",
          source:       "api_route",
          entity_type:  "mission",
          entity_id:    id as string,
          actor_type:   "system",
          payload:      { reason: code, osrm: osrmO, ors: orsO },
          http_status:  code === "NO_ROUTE" ? 422 : 503,
          duration_ms:  Date.now() - startedAt,
          request_id:   requestId,
        });
        if (err instanceof RoutingError && err.code === "NO_ROUTE") {
          return NextResponse.json(
            { error: "No existe ruta vial entre el negocio y el destino indicado.", code: "NO_ROUTE" },
            { status: 422 }
          );
        }
        return NextResponse.json(
          { error: "No se pudo calcular la ruta. Intenta de nuevo en unos momentos.", code: "ROUTING_UNAVAILABLE" },
          { status: 503 }
        );
      }
    }

    // Motor de pricing autoritativo — una sola fuente de verdad para el split
    const catalogResult = calcularMisionCatalogo(pricingDistanceKm, subtotalProductos, CATALOG_SERVICE_TYPE);

    if (catalogResult.outOfRange) {
      await logEvent({
        event_type:   "api.create.error_422",
        severity:     "warn",
        source:       "api_route",
        entity_type:  "mission",
        entity_id:    id as string,
        actor_type:   "system",
        payload:      { reason: "distance_out_of_range", distance_km: pricingDistanceKm },
        http_status:  422,
        duration_ms:  Date.now() - startedAt,
        request_id:   requestId,
      });
      return NextResponse.json(
        { error: "Distancia fuera de cobertura o no calculable.", code: "OUT_OF_RANGE", distance_km: pricingDistanceKm },
        { status: 422 }
      );
    }

    serviceFee   = catalogResult.servicioOrbi;
    totalAmount  = catalogResult.totalCliente;
    costoAgente  = catalogResult.costoAgente;
    gananciaOrbi = catalogResult.gananciaOrbi;

    // S5 (G1): Validar cotización esperada — el cliente debe confirmar el precio antes de crear
    const expectedFee   = body.expected_service_fee;
    const expectedTotal = body.expected_total_amount;
    if (!Number.isFinite(expectedFee) || !Number.isFinite(expectedTotal)) {
      return NextResponse.json(
        { error: "QUOTE_REQUIRED" },
        { status: 422 }
      );
    }
    if (expectedFee !== serviceFee || expectedTotal !== totalAmount) {
      return NextResponse.json(
        { error: "QUOTE_CHANGED", service_fee: serviceFee, total_amount: totalAmount },
        { status: 409 }
      );
    }

  } else {
    // Misión directa — delegado a computeQuote (motor_params DB, origin→destination)
    const agentLat = typeof selected_agent_lat === "number" ? selected_agent_lat : null;
    const agentLng = typeof selected_agent_lng === "number" ? selected_agent_lng : null;

    // A2.1 — Carga única de motor_params para validación de cobertura + cotización.
    // Se pasa preloadedMotorData a computeQuote para evitar una segunda lectura a DB.
    const motorData = await loadMotorParams("zumpahuacan");

    // Validación de radio de servicio (A2.1).
    // Usa pricingDistanceKm (Haversine servidor), nunca la distancia vial del cliente.
    // Comparación estricta: el valor configurado es el máximo incluido en cobertura.
    if (pricingDistanceKm != null && pricingDistanceKm > motorData.params.radioServicioMaximoKm) {
      // Una decimal normalmente; dos decimales cuando está a menos de 0.1 km del límite
      // para evitar mensajes confusos como "30.0 km supera el límite de 30 km".
      const limitKm   = motorData.params.radioServicioMaximoKm;
      const delta     = pricingDistanceKm - limitKm;
      const displayKm = delta < 0.1
        ? pricingDistanceKm.toFixed(2)
        : pricingDistanceKm.toFixed(1);
      await logEvent({
        event_type:   "api.create.error_422",
        severity:     "warn",
        source:       "api_route",
        entity_type:  "mission",
        entity_id:    id as string,
        actor_type:   "system",
        payload:      { reason: "a2_coverage_exceeded", pricingDistanceKm, radioServicioMaximoKm: limitKm, scope: "zumpahuacan" },
        http_status:  422,
        duration_ms:  Date.now() - startedAt,
        request_id:   requestId,
      });
      return NextResponse.json(
        {
          error: `Esta solicitud cubre aproximadamente ${displayKm} km y supera el límite actual de cobertura de ORBI de ${limitKm} km. Ajusta el origen o destino para continuar.`,
        },
        { status: 422 }
      );
    }

    const directResult = await computeQuote({
      isCatalog:          false,
      agentLat, agentLng,
      originLat:          oLat, originLng: oLng,
      destinationLat:     dLat, destinationLng: dLng,
      clientDistanceKm:   null, // create siempre usa haversine propio; OSRM viene del cliente solo para catálogo
      items:              [],
      serviceType:        service_type as string,
      preloadedMotorData: motorData,
    });

    serviceFee            = directResult.serviceFee;
    totalAmount           = directResult.totalAmount;
    costoAgente           = Math.round(serviceFee * 0.70);
    gananciaOrbi          = serviceFee - costoAgente;
    motorParamsVersionForRow = directResult.motorParamsVersion;
  }

  // ── Construir fila para Supabase ─────────────────────────────────────────

  const firstItem = authoritativeItems[0] ?? null;
  const missionRow = {
    id:                 id as string,
    guest_id:           (guest_id as string | null) ?? null,
    user_id:            (user_id as string | null) ?? null,
    // El servidor determina el estado inicial desde el tipo de misión
    status:             isCatalog ? "esperando_negocio" : "por_tomar",
    mission_type:       isCatalog ? "compra_negocio" : "directa",
    service_type:       isCatalog ? CATALOG_SERVICE_TYPE : service_type as string,
    detail:             (detail as string) ?? "",
    estimated_orbit:    (estimated_orbit as string) ?? "",

    requester_name:     (requester_name as string) ?? "",
    requester_phone:    requester_phone as string,

    origin_text:        (origin_text as string) ?? "",
    origin_lat:         isCatalog ? bLat : oLat,
    origin_lng:         isCatalog ? bLng : oLng,
    destination_text:   (destination_text as string) ?? "",
    destination_lat:    dLat,
    destination_lng:    dLng,

    business_id:        (business_id as string | null) ?? null,
    business_name:      (business_name as string | null) ?? null,

    // Snapshot autoritativo del carrito — inmutable después del INSERT.
    // Reemplaza product_id, product_ids, product_name y categoria_producto
    // como fuente histórica de la compra.
    items:              authoritativeItems.length > 0 ? authoritativeItems : null,

    selected_agent_id:      (selected_agent_id as string | null) || null,
    selected_agent_name:    (selected_agent_name as string | null) || null,
    selected_agent_lat:     typeof selected_agent_lat === "number" ? selected_agent_lat : null,
    selected_agent_lng:     typeof selected_agent_lng === "number" ? selected_agent_lng : null,
    selected_agent_zone:    (selected_agent_zone as string | null) ?? null,
    active_agent_id:        (active_agent_id as string | null) ?? null,
    accepted_at:            (accepted_at as string | null) ?? null,

    // payment_status siempre es "pendiente" en creación — el cliente no lo elige.
    payment_status:      "pendiente",
    payment_method:      (payment_method as string) ?? "efectivo",

    // ── Valores financieros — calculados exclusivamente por el servidor ────────
    subtotal_productos:  subtotalProductos,
    service_fee:         serviceFee,
    total_amount:        totalAmount,
    costo_agente:        costoAgente,
    ganancia_orbi:       gananciaOrbi,
    pricing_rule:        PRICING_RULE,
    motor_params_version: motorParamsVersionForRow,

    // Para misiones de catálogo: distancia vial autoritativa (pricingDistanceKm).
    // Para misiones directas: hint del cliente (display).
    distance_km:         isCatalog
                           ? (typeof pricingDistanceKm === "number" ? pricingDistanceKm : null)
                           : (typeof clientDistanceKm === "number" ? clientDistanceKm : null),
    duration_min:        typeof duration_min === "number" ? duration_min : null,
    route_geometry:      Array.isArray(route_geometry) ? route_geometry : null,

    created_at:          (created_at as string | null) ?? new Date().toISOString(),
    updated_at:          (updated_at as string | null) ?? new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("missions")
    .insert(missionRow)
    .select()
    .single();

  if (error) {
    // PK conflict: a concurrent request already inserted this mission.
    // Fetch and return the existing row so all concurrent callers get the same result.
    if (error.code === "23505") {
      const { data: existing, error: fetchErr } = await admin
        .from("missions")
        .select()
        .eq("id", id as string)
        .single();
      if (fetchErr || !existing) {
        return NextResponse.json(
          { error: "Conflicto de idempotencia: misión existente no encontrada." },
          { status: 500 }
        );
      }
      return NextResponse.json({ mission: existing });
    }
    console.error("[missions/create] INSERT error:", error);
    await logEvent({
      event_type:   "api.create.error_500",
      severity:     "error",
      source:       "api_route",
      entity_type:  "mission",
      entity_id:    id as string,
      actor_type:   "system",
      payload:      { mission_type: isCatalog ? "compra_negocio" : "directa" },
      error_detail: error.message,
      http_status:  500,
      duration_ms:  Date.now() - startedAt,
      request_id:   requestId,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logEvent({
    event_type:   "mission.created",
    severity:     "info",
    source:       "api_route",
    entity_type:  "mission",
    entity_id:    data.id as string,
    actor_type:   "system",
    payload:      {
      mission_type:       data.mission_type,
      service_type:       data.service_type,
      total_amount:       data.total_amount,
      service_fee:        data.service_fee,
      subtotal_productos: data.subtotal_productos,
      pricing_rule:       data.pricing_rule,
      distance_km:        data.distance_km,
      guest_id:           data.guest_id ?? null,
      user_id:            data.user_id  ?? null,
    },
    http_status:  201,
    duration_ms:  Date.now() - startedAt,
    request_id:   requestId,
  });

  return NextResponse.json({ ok: true, mission: data }, { status: 201 });
}
