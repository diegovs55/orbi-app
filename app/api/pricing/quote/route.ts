/**
 * POST /api/pricing/quote
 *
 * Cotización de precio usando exactamente el mismo motor y parámetros
 * que usa /api/missions/create. Permite que el frontend muestre al cliente
 * el precio real antes de confirmar.
 *
 * No persiste nada. No requiere autenticación.
 */

import { NextRequest, NextResponse } from "next/server";
import { computeQuote } from "@/lib/pricing/server";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

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
}
