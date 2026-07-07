import { NextRequest, NextResponse } from "next/server";

export type RouteResult = {
  distance_km: number;
  duration_min: number;
  // [lat, lng] pairs — Leaflet-ready order
  geometry: [number, number][];
};

// Swap GeoJSON [lng, lat] → Leaflet [lat, lng]
function swapCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

async function osrm(
  oLat: number, oLng: number,
  dLat: number, dLng: number
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${oLng},${oLat};${dLng},${dLat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url, {
    headers: { "User-Agent": "OrbiMVP/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);

  const json = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (json.code !== "Ok" || !json.routes?.length) throw new Error("OSRM: no route");

  const route = json.routes[0];
  return {
    distance_km: route.distance / 1000,
    duration_min: route.duration / 60,
    geometry: swapCoords(route.geometry.coordinates),
  };
}

async function ors(
  oLat: number, oLng: number,
  dLat: number, dLng: number,
  apiKey: string
): Promise<RouteResult> {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [[oLng, oLat], [dLng, dLat]],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);

  const json = (await res.json()) as {
    features?: {
      geometry: { coordinates: [number, number][] };
      properties: { summary: { distance: number; duration: number } };
    }[];
  };
  const feat = json.features?.[0];
  if (!feat) throw new Error("ORS: no route");

  return {
    distance_km: feat.properties.summary.distance / 1000,
    duration_min: feat.properties.summary.duration / 60,
    geometry: swapCoords(feat.geometry.coordinates),
  };
}

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
    const orsKey = process.env.ORS_API_KEY;
    const result = orsKey
      ? await ors(oLat, oLng, dLat, dLng, orsKey)
      : await osrm(oLat, oLng, dLat, dLng);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/routing/route]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Routing unavailable." }, { status: 503 });
  }
}
