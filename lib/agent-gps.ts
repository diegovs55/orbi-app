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
 *   - All functions are safe to call in SSR — they exit immediately when GPS unavailable.
 *
 * MOBILE-03 additions:
 *   - Emits GPS state (searching / active / no-permission / disabled) via gps-state.ts
 *   - Retry logic with exponential backoff on POSITION_UNAVAILABLE and TIMEOUT errors
 *   - PERMISSION_DENIED stops retries and emits "no-permission"
 *   - Persists last position via gps-state.ts for recovery on app restart
 */

import { updateAgentOrbit } from "@/lib/agents";
import { supabaseAgent } from "@/lib/supabase-agent-client";
import { geoWatchPosition, geoClearWatch, geoIsAvailable } from "@/lib/geo";
import {
  gpsSetActive,
  gpsSetDisabled,
  gpsSetNoPermission,
  gpsSetSearching,
  gpsSetUnknown,
} from "@/lib/gps-state";

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_DISTANCE_M  = 15;
const MIN_INTERVAL_MS = 20_000;

// Retry on transient errors (TIMEOUT or POSITION_UNAVAILABLE)
const MAX_RETRIES   = 5;
const RETRY_BASE_MS = 3_000;  // 3 s, 6 s, 12 s, 24 s, 48 s

// ── Module-level singleton state ──────────────────────────────────────────────

let watchId: string | number | null = null;
let lastWrite: { lat: number; lng: number; ts: number } | null = null;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// Capture watch params for retry
let _watchParams: {
  agentId: string;
  serviceType: string;
  availability: string;
  radiusKm: number;
} | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function retryDelay(attempt: number): number {
  return RETRY_BASE_MS * Math.pow(2, attempt);
}

// ── Core watcher ──────────────────────────────────────────────────────────────

function openWatcher(
  agentId: string,
  serviceType: string,
  availability: string,
  radiusKm: number,
): void {
  gpsSetSearching();

  watchId = geoWatchPosition(
    (pos) => {
      // Success path: reset retries, emit active state
      retryCount = 0;
      clearRetryTimer();

      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      gpsSetActive({ lat, lng, accuracy, ts: Date.now() });

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
      }, supabaseAgent);
    },

    (err) => {
      // Permission denied — stop immediately, no retry
      if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
        gpsSetNoPermission();
        stopGpsWatch();
        return;
      }

      // GPS off or unavailable — exponential backoff retry
      const isUnavailable = err.code === GeolocationPositionError.POSITION_UNAVAILABLE;
      const isTimeout     = err.code === GeolocationPositionError.TIMEOUT;

      if ((isUnavailable || isTimeout) && retryCount < MAX_RETRIES) {
        if (isUnavailable) gpsSetDisabled("GPS apagado o sin señal. Reintentando…");
        // For timeout we stay in "searching" — don't downgrade the visual state

        // Close current watcher before reopening
        if (watchId !== null) {
          geoClearWatch(watchId);
          watchId = null;
        }

        const delay = retryDelay(retryCount);
        retryCount++;

        retryTimer = setTimeout(() => {
          if (_watchParams) {
            openWatcher(
              _watchParams.agentId,
              _watchParams.serviceType,
              _watchParams.availability,
              _watchParams.radiusKm,
            );
          }
        }, delay);
        return;
      }

      // Exhausted retries
      gpsSetDisabled("No se pudo obtener señal GPS. Verifica que el GPS esté activado.");
      stopGpsWatch();
    },

    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if a watchPosition is currently active. */
export function isGpsWatching(): boolean {
  return watchId !== null;
}

/**
 * Start watching GPS and writing to Supabase.
 * Caller must have already verified permission is "granted" before calling.
 * No-op if a watcher is already running (preserves the existing watcher).
 */
export function startGpsWatch(
  agentId: string,
  serviceType: string,
  availability: string,
  radiusKm: number,
): void {
  if (!geoIsAvailable()) {
    gpsSetDisabled();
    return;
  }
  if (watchId !== null) return; // already watching — do not open a second watcher

  retryCount = 0;
  _watchParams = { agentId, serviceType, availability, radiusKm };
  openWatcher(agentId, serviceType, availability, radiusKm);
}

/**
 * Stop the active watcher and clear last-write state.
 * Call this only on explicit "exit orbit" or logout — NOT on page navigation.
 */
export function stopGpsWatch(): void {
  clearRetryTimer();
  if (watchId !== null) {
    geoClearWatch(watchId);
    watchId = null;
  }
  lastWrite  = null;
  retryCount = 0;
  _watchParams = null;
  gpsSetUnknown();
}

/**
 * Seed the last-write position so the first real GPS event is compared correctly.
 * Call this right after getting the initial position in handleEnterOrbit.
 */
export function seedLastGpsWrite(lat: number, lng: number): void {
  lastWrite = { lat, lng, ts: Date.now() };
}
