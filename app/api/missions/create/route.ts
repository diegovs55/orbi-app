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
import { calcularMisionCatalogo, estimateMissionCost, PRICING_RULE } from "@/lib/pricing";
import { logEvent } from "@/lib/event-log";
import { getAdmin } from "@/lib/supabase-admin";

// ── Admin client ──────────────────────────────────────────────────────────────


// ── Haversine server-side ─────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estrategia de distancia para pricing:
 * El cliente puede enviar distance_km desde OSRM (más preciso que haversine).
 * El servidor acepta ese valor solo si está dentro del ±25% de su propio haversine.
 * Si difiere más, usa el haversine del servidor — posible manipulación de distancia.
 */
function resolveDistance(
  clientDistanceKm: number | null | undefined,
  serverHaversine: number
): number {
  if (clientDistanceKm == null || !Number.isFinite(clientDistanceKm) || clientDistanceKm <= 0) {
    return serverHaversine;
  }
  const ratio = clientDistanceKm / serverHaversine;
  if (ratio >= 0.75 && ratio <= 1.25) {
    return clientDistanceKm; // OSRM es más preciso — usar si está dentro del margen
  }
  return serverHaversine; // Diferencia sospechosa — usar haversine del servidor
}

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
  const dLat = typeof destination_lat === "number" ? destination_lat : null;
  const dLng = typeof destination_lng === "number" ? destination_lng : null;

  let pricingDistanceKm: number | null = null;
  if (oLat != null && oLng != null && dLat != null && dLng != null) {
    const serverHaversine = haversineKm(oLat, oLng, dLat, dLng);
    pricingDistanceKm = resolveDistance(
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

    const productIds = clientLineItems.map((i) => i.product_id);

    // Consultar precios y metadata desde public.products — fuente autoritativa
    const { data: catalogRows, error: catalogError } = await admin
      .from("products")
      .select("id, name, price, business_id, category")
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

    // Motor de pricing autoritativo — una sola fuente de verdad para el split
    const catalogResult = calcularMisionCatalogo(pricingDistanceKm, subtotalProductos, service_type as string);

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
        { error: "Distancia fuera de cobertura o no calculable." },
        { status: 422 }
      );
    }

    serviceFee   = catalogResult.servicioOrbi;
    totalAmount  = catalogResult.totalCliente;
    costoAgente  = catalogResult.costoAgente;
    gananciaOrbi = catalogResult.gananciaOrbi;

  } else {
    // Misión directa — distancia agente→origen para pricing
    const agentLat = typeof selected_agent_lat === "number" ? selected_agent_lat : null;
    const agentLng = typeof selected_agent_lng === "number" ? selected_agent_lng : null;

    let agentToOriginKm: number | null = null;
    if (agentLat != null && agentLng != null && oLat != null && oLng != null) {
      agentToOriginKm = haversineKm(agentLat, agentLng, oLat, oLng);
    }

    const directResult = estimateMissionCost(agentToOriginKm);
    serviceFee   = directResult.price;
    totalAmount  = directResult.price;
    costoAgente  = directResult.agentCost;
    gananciaOrbi = directResult.orbiProfit;
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
    service_type:       service_type as string,
    detail:             (detail as string) ?? "",
    estimated_orbit:    (estimated_orbit as string) ?? "",

    requester_name:     (requester_name as string) ?? "",
    requester_phone:    requester_phone as string,

    origin_text:        (origin_text as string) ?? "",
    origin_lat:         oLat,
    origin_lng:         oLng,
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

    // Metadata de ruta (display — no afectan precios)
    distance_km:         typeof clientDistanceKm === "number" ? clientDistanceKm : null,
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
