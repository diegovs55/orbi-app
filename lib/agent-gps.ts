/**
 * agent-gps — singleton GPS watcher for the active agent session.
 *
 * Lives at module scope so it survives React component unmounts (page navigation).
 * Each browser tab has its own isolated module instance → no cross-agent interference.
 *
 * Invariants:
 *   - At most one watchPosition is active at any time (watchId guard).
 *   - startGpsWatch is a no-op if a watcher is already running.
 *   - stopGpsWatch is the only way to kill the watcher (besides tab close).
 *   - All functions are safe to call in SSR — they exit immediately if navigator
 *     is undefined (server context).
 */

import { updateAgentOrbit } from "@/lib/agents";

const MIN_DISTANCE_M = 15;
const MIN_INTERVAL_MS = 20_000;

let watchId: number | null = null;
let lastWrite: { lat: number; lng: number; ts: number } | null = null;

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns true if a watchPosition is currently active. */
export function isGpsWatching(): boolean {
  return watchId !== null;
}

/**
 * Start watching GPS and writing to Supabase.
 * No-op if a watcher is already running (preserves the existing watcher).
 */
export function startGpsWatch(
  agentId: string,
  serviceType: string,
  availability: string,
  radiusKm: number,
): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (watchId !== null) return; // already watching — do not open a second watcher

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const now = Date.now();
      const last = lastWrite;

      const movedEnough =
        !last || haversineMeters(last.lat, last.lng, lat, lng) >= MIN_DISTANCE_M;
      const enoughTime = !last || now - last.ts >= MIN_INTERVAL_MS;

      if (!movedEnough && !enoughTime) return;

      lastWrite = { lat, lng, ts: now };

      void updateAgentOrbit(agentId, {
        isOnOrbit: true,
        lat,
        lng,
        radiusKm,
        serviceType: serviceType as never,
        availability,
      });
    },
    () => { /* silently ignore watch errors — orbit status unchanged */ },
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
  );
}

/**
 * Stop the active watcher and clear last-write state.
 * Call this only on explicit "exit orbit" or logout — NOT on page navigation.
 */
export function stopGpsWatch(): void {
  if (typeof navigator === "undefined") return;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  lastWrite = null;
}

/**
 * Seed the last-write position so the first real GPS event is compared correctly.
 * Call this right after getting the initial position in handleEnterOrbit.
 */
export function seedLastGpsWrite(lat: number, lng: number): void {
  lastWrite = { lat, lng, ts: Date.now() };
}
