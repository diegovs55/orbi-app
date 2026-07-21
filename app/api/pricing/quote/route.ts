/**
 * POST /api/pricing/quote
 *
 * Para misiones de catálogo (is_catalog === true) — rama autoritativa G1:
 *   Resuelve coords del negocio desde DB (nunca confía en el GPS del cliente),
 *   computa Haversine negocio→destino, consulta precios autoritativos y devuelve
 *   {service_fee, total_amount, products_subtotal, pricing_distance_km}.
 *
 * Para misiones directas (is_catalog !== true):
 *   Rama existente sin cambios — delega a computeQuote.
 *
 * No persiste nada. No requiere autenticación.
 */

import { NextRequest, NextResponse } from "next/server";
import { computeQuote, haversineKmServer } from "@/lib/pricing/server";
import { calcularMisionCatalogo } from "@/lib/pricing";
import { getAdmin } from "@/lib/supabase-admin";

const CATALOG_SERVICE_TYPE = "Compra local";
const CATALOG_MAX_QUANTITY = 99;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.is_catalog === true) {
    // ── Catalog-authoritative branch (G1) ────────────────────────────────────
    // El servidor resuelve coords del negocio desde DB. El GPS del solicitante
    // no interviene en el precio ni en la distancia de cotización.

    // V7: business_id required
    const businessId =
      typeof body.business_id === "string" && body.business_id.trim()
        ? body.business_id
        : null;
    if (!businessId) {
      return NextResponse.json(
        { error: "business_id es requerido para cotización de catálogo." },
        { status: 400 }
      );
    }

    // V1: items required and non-empty
    if (!Array.isArray(body.items) || (body.items as unknown[]).length === 0) {
      return NextResponse.json(
        { error: "items es requerido y no puede estar vacío." },
        { status: 400 }
      );
    }

    // V2–V6: validate each item
    const rawItems = body.items as Array<unknown>;
    const seenProductIds = new Set<string>();
    const validatedItems: { product_id: string; quantity: number }[] = [];
    for (const raw of rawItems) {
      if (typeof raw !== "object" || raw === null) {
        return NextResponse.json({ error: "Cada ítem debe ser un objeto." }, { status: 400 });
      }
      const item = raw as Record<string, unknown>;
      // V2
      if (typeof item.product_id !== "string" || !item.product_id.trim()) {
        return NextResponse.json({ error: "product_id es requerido en cada ítem." }, { status: 400 });
      }
      // V3 + V4
      if (
        !Number.isFinite(item.quantity) ||
        !Number.isInteger(item.quantity as number) ||
        (item.quantity as number) <= 0
      ) {
        return NextResponse.json(
          { error: `quantity inválida en ítem ${item.product_id}.` },
          { status: 400 }
        );
      }
      // V5
      if ((item.quantity as number) > CATALOG_MAX_QUANTITY) {
        return NextResponse.json(
          { error: `quantity excede el máximo permitido (${CATALOG_MAX_QUANTITY}).` },
          { status: 400 }
        );
      }
      // V6: no duplicates — viola regla de negocio → 422
      if (seenProductIds.has(item.product_id)) {
        return NextResponse.json(
          { error: "El carrito contiene productos duplicados." },
          { status: 422 }
        );
      }
      seenProductIds.add(item.product_id);
      validatedItems.push({ product_id: item.product_id, quantity: item.quantity as number });
    }

    // V8: destination coordinates required and finite
    if (!Number.isFinite(body.destination_lat) || !Number.isFinite(body.destination_lng)) {
      return NextResponse.json(
        { error: "destination_lat y destination_lng son requeridos." },
        { status: 400 }
      );
    }
    const dLat = body.destination_lat as number;
    const dLng = body.destination_lng as number;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
    }

    // S1: Resolver coordenadas del negocio desde DB (nunca del cliente)
    const { data: businessRow, error: businessError } = await admin
      .from("businesses")
      .select("latitude, longitude")
      .eq("id", businessId)
      .single();
    if (businessError || !businessRow) {
      return NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 });
    }
    const bLat = Number(businessRow.latitude);
    const bLng = Number(businessRow.longitude);
    if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) {
      return NextResponse.json(
        { error: "El negocio no tiene coordenadas geográficas válidas." },
        { status: 422 }
      );
    }

    // S2: Precios autoritativos de productos desde DB
    const productIds = validatedItems.map((i) => i.product_id);
    const { data: productRows, error: productError } = await admin
      .from("products")
      .select("id, price, business_id")
      .in("id", productIds);
    if (productError) {
      return NextResponse.json({ error: "Error al verificar productos." }, { status: 500 });
    }
    const productMap = new Map(
      (productRows ?? []).map((r) => [r.id as string, r])
    );
    const missingIds = productIds.filter((pid) => !productMap.has(pid));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no encontrados: ${missingIds.join(", ")}` },
        { status: 404 }
      );
    }
    const wrongBusiness = productIds.filter((pid) => {
      const row = productMap.get(pid);
      return row && row.business_id !== businessId;
    });
    if (wrongBusiness.length > 0) {
      return NextResponse.json(
        { error: "Uno o más productos no pertenecen al negocio declarado." },
        { status: 422 }
      );
    }

    const productsSubtotal = Math.round(
      validatedItems.reduce((sum, item) => {
        const row = productMap.get(item.product_id)!;
        return sum + (Number(row.price) || 0) * item.quantity;
      }, 0) * 100
    ) / 100;

    // S3: Haversine negocio→destino (el GPS del solicitante no interviene)
    const pricingDistanceKm = haversineKmServer(bLat, bLng, dLat, dLng);

    // S4: Motor de catálogo
    const catalogResult = calcularMisionCatalogo(
      pricingDistanceKm,
      productsSubtotal,
      CATALOG_SERVICE_TYPE
    );
    if (catalogResult.outOfRange) {
      return NextResponse.json({ error: "Distancia fuera de cobertura." }, { status: 422 });
    }

    return NextResponse.json({
      service_fee:         catalogResult.servicioOrbi,
      total_amount:        catalogResult.totalCliente,
      products_subtotal:   productsSubtotal,
      pricing_distance_km: pricingDistanceKm,
    });
  }

  // ── Direct mission branch (unchanged) ────────────────────────────────────
  try {
    const result = await computeQuote({
      isCatalog:        Boolean(body.is_catalog),
      agentLat:         typeof body.agent_lat        === "number" ? body.agent_lat        : null,
      agentLng:         typeof body.agent_lng        === "number" ? body.agent_lng        : null,
      originLat:        typeof body.origin_lat       === "number" ? body.origin_lat       : null,
      originLng:        typeof body.origin_lng       === "number" ? body.origin_lng       : null,
      destinationLat:   typeof body.destination_lat  === "number" ? body.destination_lat  : null,
      destinationLng:   typeof body.destination_lng  === "number" ? body.destination_lng  : null,
      clientDistanceKm: typeof body.distance_km      === "number" ? body.distance_km      : null,
      items:            Array.isArray(body.items)
                          ? (body.items as Array<{ product_id: string; quantity: number }>)
                          : [],
      serviceType:      typeof body.service_type === "string" ? body.service_type : "",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al calcular cotización.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
