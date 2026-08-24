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

  // Load motor params from DB (same source dispatch uses for radioAsignacionMaximaKm).
  // maxPickupEtaMin is used EXCLUSIVELY by this endpoint — not by missions, dispatch, or pricing.
  const { params: motorParams } = await loadMotorParams("zumpahuacan");
  const { radioAsignacionMaximaKm, maxPickupEtaMin } = motorParams;

  // 1. Load available agents (service_role reads current_lat/current_lng, bypassing RLS)
  const { data: agentRows, error: agentError } = await admin
    .from("agents")
    .select(
      "id,name,photo_url,initials,vehicle,trust_level,description,service_type,zone," +
        "status,admin_status,is_on_orbit,availability,lat,lng,current_lat,current_lng,radius_km," +
        "agent_vehicles!agents_active_vehicle_id_fkey(display_label,vehicle_type)",
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
    vehicleLabel: string | null;
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
      vehicleLabel: ((row.agent_vehicles as { display_label?: string } | null)?.display_label ?? (row.vehicle as string | null)) ?? null,
      trust_level: (row.trust_level as string | null) ?? "",
      description: (row.description as string | null) ?? "",
      service_type: (row.service_type as string | null) ?? "",
      zone: (row.zone as string | null) ?? "",
    });
  }

  if (available.length === 0) {
    return NextResponse.json(
      { available: 0, pickup_distance_km: null, pickup_eta_min: null, orbits: [], nearby_agents: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 4. Sort haversine candidates by proximity — prefiltro only, not eligibility criterion.
  available.sort((a, b) => a.distKm - b.distKm);

  // 4b. Road-eligibility filter — OSRM called for ALL haversine-eligible candidates.
  //     Agents with duration_min > maxPickupEtaMin are excluded from public availability.
  //     maxPickupEtaMin is used EXCLUSIVELY here — missions/dispatch/pricing are unaffected.
  //     Partial OSRM failures use verified results only; total failure → routing_unavailable.
  //     No agent coordinates, geometry, duration_min exact value, or identity sent to client.
  const routeResults = await Promise.allSettled(
    available.map((a) => getRouteDistanceKm(a.lat, a.lng, queryLat, queryLng))
  );

  const allRoutingFailed = routeResults.every((r) => r.status === "rejected");

  if (allRoutingFailed) {
    return NextResponse.json(
      {
        available: 0,
        availability_status: "routing_unavailable" as const,
        pickup_distance_km: null,
        pickup_eta_min: null,
        orbits: [],
        nearby_agents: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  type RoutedAgent = (typeof available)[0] & { duration_min: number; distance_km: number };
  const routable: RoutedAgent[] = [];
  for (let i = 0; i < available.length; i++) {
    const r = routeResults[i];
    if (r.status !== "fulfilled") continue;
    if (r.value.duration_min > maxPickupEtaMin) continue;
    routable.push({ ...available[i], duration_min: r.value.duration_min, distance_km: r.value.distance_km });
  }

  if (routable.length === 0) {
    return NextResponse.json(
      { available: 0, pickup_distance_km: null, pickup_eta_min: null, orbits: [], nearby_agents: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // best via reduce() — routable[] is NOT sorted in-place so that nearby_agents order
  // (haversine proximity) remains independent of ETA, preserving the privacy invariant
  // that no profile position can be mapped to the route that produced pickup_eta_min.
  const best = routable.reduce((a, b) => a.duration_min < b.duration_min ? a : b);
  const pickupDistanceKm = best.distance_km < 1
    ? Math.round(best.distance_km * 10) / 10  // 1 decimal for sub-km (e.g. 0.4)
    : Math.round(best.distance_km);            // integer for ≥1 km (e.g. 8)
  const pickupEtaMin = Math.ceil(best.duration_min);

  // 5. Orbit centroid — computed from vially-eligible agents only, degraded to 2 decimal
  //    places (~1.1 km precision). No individual agent coordinates or identifiers exposed.
  const routableIds = new Set(routable.map((a) => a.id));
  const centLat = routable.reduce((s, a) => s + a.lat, 0) / routable.length;
  const centLng = routable.reduce((s, a) => s + a.lng, 0) / routable.length;
  const degradedLat = Math.round(centLat * 100) / 100;
  const degradedLng = Math.round(centLng * 100) / 100;

  // 6. Public profiles — from available[] (haversine order), filtered to routable only.
  //    Order is haversine proximity — independent of routing results and ETA values.
  //    No position data: no lat, lng, current_lat, current_lng, distKm, duration_min, distance_km.
  //    No agent_id → ETA/distance mapping is possible from the response.
  const nearbyAgents = available
    .filter((a) => routableIds.has(a.id))
    .slice(0, 3)
    .map((a) => ({
      id: a.id,
      name: a.name,
      photo_url: a.photo_url,
      initials: a.initials,
      vehicle: a.vehicleLabel ?? a.vehicle,
      trust_level: a.trust_level,
      description: a.description,
      service_type: a.service_type,
      zone: a.zone,
    }));

  return NextResponse.json(
    {
      available: routable.length,
      availability_status: "confirmed" as const,
      pickup_distance_km: pickupDistanceKm,
      pickup_eta_min: pickupEtaMin,
      orbits: [{ lat: degradedLat, lng: degradedLng }],
      nearby_agents: nearbyAgents,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
