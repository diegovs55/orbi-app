/**
 * Motor de routing vial — servidor únicamente.
 *
 * Política de proveedores (secuencial, con fallback):
 *   1. Intentar OSRM.
 *   2. Si OSRM encuentra ruta → devolver distancia.
 *   3. Si OSRM no encuentra ruta o falla técnicamente → intentar ORS (si ORS_API_KEY existe).
 *   4. Si ORS encuentra ruta → devolver distancia.
 *   5. Si ambos responden sin ruta → RoutingError code "NO_ROUTE".
 *   6. Si ninguno encontró ruta y al menos uno falló técnicamente → RoutingError code "ROUTING_UNAVAILABLE".
 *
 * Haversine no es fallback de precio. Si no hay ruta vial, el caller recibe un error tipado.
 */

export type RouteResult = {
  distance_km: number;
  duration_min: number;
  geometry: [number, number][];
};

/** Estado individual de cada proveedor al finalizar el intento. */
export type ProviderOutcome =
  | "route_found"
  | "no_route"
  | "provider_error"
  | "timeout"
  | "provider_unavailable";

/** Error tipado que reemplaza excepciones anónimas en los callers de routing. */
export class RoutingError extends Error {
  constructor(
    public readonly code: "NO_ROUTE" | "ROUTING_UNAVAILABLE",
    public readonly osrmOutcome: ProviderOutcome,
    public readonly orsOutcome: ProviderOutcome,
    message: string,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

const TIMEOUT_MS = 8_000;

function swapCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

type OsrmAttempt =
  | { outcome: "route_found"; result: RouteResult }
  | { outcome: "no_route" }
  | { outcome: "provider_error" | "timeout" | "provider_unavailable"; message: string };

async function attemptOsrm(
  oLat: number, oLng: number,
  dLat: number, dLng: number,
): Promise<OsrmAttempt> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${oLng},${oLat};${dLng},${dLat}` +
    `?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OrbiMVP/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { outcome: "provider_error", message: `OSRM HTTP ${res.status}` };

    const json = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };

    if (json.code !== "Ok" || !json.routes?.length) {
      return { outcome: "no_route" };
    }

    const route = json.routes[0];
    return {
      outcome: "route_found",
      result: {
        distance_km: route.distance / 1000,
        duration_min: route.duration / 60,
        geometry: swapCoords(route.geometry.coordinates),
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { outcome: "timeout", message: "OSRM timeout" };
    }
    return { outcome: "provider_error", message: err instanceof Error ? err.message : "OSRM unknown error" };
  }
}

type OrsAttempt =
  | { outcome: "route_found"; result: RouteResult }
  | { outcome: "no_route" }
  | { outcome: "provider_error" | "timeout" | "provider_unavailable"; message: string };

async function attemptOrs(
  oLat: number, oLng: number,
  dLat: number, dLng: number,
  apiKey: string,
): Promise<OrsAttempt> {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[oLng, oLat], [dLng, dLat]] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // ORS devuelve 404 cuando no existe ruta para las coordenadas dadas.
    if (res.status === 404) return { outcome: "no_route" };
    if (!res.ok) return { outcome: "provider_error", message: `ORS HTTP ${res.status}` };

    const json = (await res.json()) as {
      features?: {
        geometry: { coordinates: [number, number][] };
        properties: { summary: { distance: number; duration: number } };
      }[];
    };

    const feat = json.features?.[0];
    if (!feat) return { outcome: "no_route" };

    return {
      outcome: "route_found",
      result: {
        distance_km: feat.properties.summary.distance / 1000,
        duration_min: feat.properties.summary.duration / 60,
        geometry: swapCoords(feat.geometry.coordinates),
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { outcome: "timeout", message: "ORS timeout" };
    }
    return { outcome: "provider_error", message: err instanceof Error ? err.message : "ORS unknown error" };
  }
}

/**
 * Obtiene la distancia vial entre dos coordenadas usando la política de proveedores aprobada.
 *
 * @throws {RoutingError} con code "NO_ROUTE" o "ROUTING_UNAVAILABLE"
 */
export async function getRouteDistanceKm(
  oLat: number, oLng: number,
  dLat: number, dLng: number,
): Promise<RouteResult> {
  const orsKey = process.env.ORS_API_KEY ?? null;

  const osrmAttempt = await attemptOsrm(oLat, oLng, dLat, dLng);

  if (osrmAttempt.outcome === "route_found") {
    return osrmAttempt.result;
  }

  // OSRM no encontró ruta o falló — intentar ORS si hay clave disponible.
  const orsAttempt: OrsAttempt = orsKey
    ? await attemptOrs(oLat, oLng, dLat, dLng, orsKey)
    : { outcome: "provider_unavailable", message: "ORS_API_KEY no configurada" };

  if (orsAttempt.outcome === "route_found") {
    return orsAttempt.result;
  }

  // Ninguno encontró ruta. Determinar código según si hubo fallo técnico.
  const osrmOutcome = osrmAttempt.outcome;
  const orsOutcome  = orsAttempt.outcome;

  const technicalFailure =
    osrmOutcome === "provider_error" || osrmOutcome === "timeout" ||
    orsOutcome  === "provider_error" || orsOutcome  === "timeout";

  const bothExplicitlyNoRoute =
    osrmOutcome === "no_route" && (orsOutcome === "no_route" || orsOutcome === "provider_unavailable");

  const code = (!technicalFailure && bothExplicitlyNoRoute) ? "NO_ROUTE" : "ROUTING_UNAVAILABLE";

  throw new RoutingError(
    code,
    osrmOutcome,
    orsOutcome,
    code === "NO_ROUTE"
      ? "No existe ruta vial entre los puntos indicados."
      : "No se pudo calcular la ruta vial (fallo de proveedor).",
  );
}
