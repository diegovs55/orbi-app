import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { loadMotorParams } from "@/lib/pricing/server";
import { getRouteDistanceKm } from "@/lib/routing/server";

export const dynamic = "force-dynamic";

// ── Pure helpers (inlined; do not import from lib/agents to avoid client-only side effects) ──

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function validCoords(lat: number | null, lng: number | null): lat is number {
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function haversineKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const R = 6371;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLng = ((lngB - lngA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) *
      Math.cos((latB * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinOperatingHours(availability: string | null): boolean {
  const av = (availability ?? "").trim().toLowerCase();
  if (!av || av === "24 horas") return true;
  const match = av.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
  if (!match) return true;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = toMin(match[1]);
  const end = toMin(match[2]);
  if (start === end) return true;
  return start < end ? nowMin >= start && nowMin <= end : nowMin >= start || nowMin <= end;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");

  const queryLat = latRaw !== null ? Number(latRaw) : NaN;
  const queryLng = lngRaw !== null ? Number(lngRaw) : NaN;

  if (
    !Number.isFinite(queryLat) ||
    !Number.isFinite(queryLng) ||
    queryLat < -90 ||
    queryLat > 90 ||
    queryLng < -180 ||
    queryLng > 180
  ) {
    return NextResponse.json(
      { error: "lat y lng son requeridos y deben ser coordenadas válidas." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Error de configuración del servidor." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Load radioAsignacionMaximaKm from DB (same source dispatch uses)
  const { params: motorParams } = await loadMotorParams("zumpahuacan");
  const { radioAsignacionMaximaKm } = motorParams;

  // 1. Load available agents (service_role reads current_lat/current_lng, bypassing RLS)
  const { data: agentRows, error: agentError } = await admin
    .from("agents")
    .select(
      "id,name,photo_url,initials,vehicle,trust_level,description,service_type,zone," +
        "status,admin_status,is_on_orbit,availability,lat,lng,current_lat,current_lng,radius_km",
    )
    .eq("admin_status", "activo")
    .eq("status", "Disponible")
    .eq("is_on_orbit", true);

  if (agentError) {
    return NextResponse.json(
      { error: "Error al consultar agentes." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2. Occupied agents: have an active mission assigned to them
  const { data: busyRows } = await admin
    .from("missions")
    .select("selected_agent_id")
    .in("status", ["aceptada", "en_mision"])
    .not("selected_agent_id", "is", null);

  const busyIds = new Set<string>(
    (busyRows ?? [])
      .map((r: Record<string, unknown>) => r.selected_agent_id)
      .filter((id): id is string => typeof id === "string"),
  );

  // 3. Filter: operating hours + valid GPS + not busy
  type AvailableAgent = {
    lat: number;
    lng: number;
    distKm: number;
    id: string;
    name: string;
    photo_url: string | null;
    initials: string | null;
    vehicle: string | null;
    trust_level: string;
    description: string;
    service_type: string;
    zone: string;
  };
  const available: AvailableAgent[] = [];

  for (const row of (agentRows ?? []) as unknown as Record<string, unknown>[]) {
    const id = row.id as string;
    if (busyIds.has(id)) continue;
    if (!isWithinOperatingHours(row.availability as string | null)) continue;

    const cLat = toNum(row.current_lat);
    const cLng = toNum(row.current_lng);
    const bLat = toNum(row.lat);
    const bLng = toNum(row.lng);

    let aLat: number | null = null;
    let aLng: number | null = null;

    if (validCoords(cLat, cLng)) {
      aLat = cLat;
      aLng = cLng;
    } else if (validCoords(bLat, bLng)) {
      aLat = bLat;
      aLng = bLng;
    } else {
      continue; // no usable GPS
    }

    const distKm = haversineKm(queryLat, queryLng, aLat, aLng as number);

    // effectiveRadius mirrors the same formula dispatch uses in getAgentOperatingEligibility()
    const agentRadius = toNum(row.radius_km) ?? radioAsignacionMaximaKm;
    const effectiveRadius = Math.min(agentRadius, radioAsignacionMaximaKm);
    if (distKm > effectiveRadius) continue;

    available.push({
      lat: aLat,
      lng: aLng as number,
      distKm,
      id,
      name: (row.name as string | null) ?? "",
      photo_url: (row.photo_url as string | null) ?? null,
      initials: (row.initials as string | null) ?? null,
      vehicle: (row.vehicle as string | null) ?? null,
      trust_level: (row.trust_level as string | null) ?? "",
      description: (row.description as string | null) ?? "",
      service_type: (row.service_type as string | null) ?? "",
      zone: (row.zone as string | null) ?? "",
    });
  }

  if (available.length === 0) {
    return NextResponse.json(
      { available: 0, nearest_distance_bucket: null, orbits: [], nearby_agents: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 4. Sort by distance; build nearest-distance bucket
  available.sort((a, b) => a.distKm - b.distKm);
  const nearestKm = available[0].distKm;
  const bucket = `a menos de ${Math.ceil(nearestKm)} km`;

  // 4b. Route-based ETA and road distance — top-3 candidates by haversine, parallel OSRM calls.
  //     Uses road-network speed profiles (not real-time traffic).
  //     No agent coordinates, geometry, duration_min exact value, or identity sent to client.
  //     Both buckets always derive from the SAME candidate (lowest duration_min) so distance
  //     and ETA are coherent even in mountainous terrain where haversine diverges from road km.
  const etaCandidates = available.slice(0, 3); // already sorted by distKm; 3 max

  const routeResults = await Promise.allSettled(
    etaCandidates.map((a) =>
      getRouteDistanceKm(a.lat, a.lng, queryLat, queryLng)
    )
  );

  type RouteCandidate = { duration_min: number; distance_km: number };
  const successfulRoutes: RouteCandidate[] = routeResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getRouteDistanceKm>>> =>
      r.status === "fulfilled"
    )
    .map((r) => ({ duration_min: r.value.duration_min, distance_km: r.value.distance_km }));

  let etaBucket: string | null;
  let routeDistanceBucket: string | null;

  if (successfulRoutes.length > 0) {
    // Pick the candidate that arrives soonest; derive road distance from that same route.
    const best = successfulRoutes.reduce((a, b) => a.duration_min < b.duration_min ? a : b);
    const bestMin = best.duration_min;
    etaBucket =
      bestMin < 5  ? "menos de 5 min" :
      bestMin < 10 ? "5–10 min"       :
      bestMin < 15 ? "10–15 min"      :
      bestMin < 20 ? "15–20 min"      : null;
    routeDistanceBucket = `~${Math.round(best.distance_km)} km`;
  } else {
    // All routing calls failed — no road distance to show; omit rather than invent.
    etaBucket = null;
    routeDistanceBucket = null;
  }

  // 5. Single aggregated orbit — centroid degraded to 2 decimal places (~1.1 km precision)
  //    NO individual agent coordinates or identifiers in the response.
  const centLat = available.reduce((s, a) => s + a.lat, 0) / available.length;
  const centLng = available.reduce((s, a) => s + a.lng, 0) / available.length;
  const degradedLat = Math.round(centLat * 100) / 100;
  const degradedLng = Math.round(centLng * 100) / 100;

  // 6. Top 3 public profiles — same available[] already sorted by distKm.
  //    Strip ALL position data: no lat, lng, current_lat, current_lng, distKm, radius_km.
  //    No agent_id → coordinate mapping is possible: orbits[] is an anonymous centroid.
  const nearbyAgents = available.slice(0, 3).map((a) => ({
    id: a.id,
    name: a.name,
    photo_url: a.photo_url,
    initials: a.initials,
    vehicle: a.vehicle,
    trust_level: a.trust_level,
    description: a.description,
    service_type: a.service_type,
    zone: a.zone,
  }));

  return NextResponse.json(
    {
      available: available.length,
      route_distance_bucket: routeDistanceBucket,
      nearest_eta_bucket: etaBucket,
      orbits: [{ lat: degradedLat, lng: degradedLng }],
      nearby_agents: nearbyAgents,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
