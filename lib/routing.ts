import type { RouteResult } from "@/app/api/routing/route/route";

export type { RouteResult };

/**
 * Fetches a real driving route from the server-side routing proxy.
 * Returns null on any failure so callers can fall back to haversine.
 */
export async function fetchRoute(
  oLat: number, oLng: number,
  dLat: number, dLng: number
): Promise<RouteResult | null> {
  try {
    const params = new URLSearchParams({
      oLat: oLat.toString(),
      oLng: oLng.toString(),
      dLat: dLat.toString(),
      dLng: dLng.toString(),
    });
    const res = await fetch(`/api/routing/route?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as RouteResult;
  } catch {
    return null;
  }
}
