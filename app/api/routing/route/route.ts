import { NextRequest, NextResponse } from "next/server";
import { getRouteDistanceKm, RoutingError } from "@/lib/routing/server";

export type { RouteResult } from "@/lib/routing/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const oLat = parseFloat(searchParams.get("oLat") ?? "");
  const oLng = parseFloat(searchParams.get("oLng") ?? "");
  const dLat = parseFloat(searchParams.get("dLat") ?? "");
  const dLng = parseFloat(searchParams.get("dLng") ?? "");

  if ([oLat, oLng, dLat, dLng].some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  try {
    const result = await getRouteDistanceKm(oLat, oLng, dLat, dLng);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RoutingError) {
      const status = err.code === "NO_ROUTE" ? 422 : 503;
      console.error(`[api/routing/route] ${err.code}: osrm=${err.osrmOutcome} ors=${err.orsOutcome}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[api/routing/route]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Routing unavailable." }, { status: 503 });
  }
}
