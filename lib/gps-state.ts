/**
 * lib/gps-state.ts — Estado central del GPS del agente.
 *
 * Singleton a nivel de módulo (un estado por pestaña del navegador).
 * Provee pub/sub para que los componentes React reaccionen a cambios
 * sin polling, sin Context, sin Zustand.
 *
 * Estados:
 *   unknown       — inicial, no se ha verificado nada
 *   searching     — permiso concedido, adquiriendo fix
 *   active        — posición válida recibida
 *   no-permission — permiso denegado (temporal o permanente)
 *   disabled      — GPS hardware apagado o API no disponible
 */

const LAST_POSITION_KEY = "orbi_gps_last_position";

export type GpsStatus =
  | "unknown"
  | "searching"
  | "active"
  | "no-permission"
  | "disabled";

export type GpsPosition = {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
};

export type GpsState = {
  status: GpsStatus;
  position: GpsPosition | null;
  errorMessage: string | null;
};

// ── Singleton state ───────────────────────────────────────────────────────────

let _state: GpsState = {
  status: "unknown",
  position: loadPersistedPosition(),
  errorMessage: null,
};

const _subscribers = new Set<(state: GpsState) => void>();

// ── Persistence ───────────────────────────────────────────────────────────────

function loadPersistedPosition(): GpsPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as GpsPosition;
    if (
      typeof p.lat === "number" &&
      typeof p.lng === "number" &&
      typeof p.ts  === "number"
    ) return p;
  } catch { /* corrupted — ignore */ }
  return null;
}

function persistPosition(pos: GpsPosition): void {
  try {
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(pos));
  } catch { /* storage full — non-critical */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getGpsState(): GpsState {
  return _state;
}

export function subscribeGpsState(cb: (state: GpsState) => void): () => void {
  _subscribers.add(cb);
  return () => { _subscribers.delete(cb); };
}

function emit(patch: Partial<GpsState>): void {
  _state = { ..._state, ...patch };
  _subscribers.forEach((cb) => cb(_state));
}

/** Llamar cuando el watcher arranca y espera el primer fix. */
export function gpsSetSearching(): void {
  emit({ status: "searching", errorMessage: null });
}

/** Llamar cada vez que llega una posición válida del watcher. */
export function gpsSetActive(pos: GpsPosition): void {
  persistPosition(pos);
  emit({ status: "active", position: pos, errorMessage: null });
}

/** Llamar cuando el permiso es denegado. */
export function gpsSetNoPermission(msg?: string): void {
  emit({ status: "no-permission", errorMessage: msg ?? "Permiso de ubicación denegado." });
}

/** Llamar cuando el GPS está apagado o no disponible por hardware. */
export function gpsSetDisabled(msg?: string): void {
  emit({ status: "disabled", errorMessage: msg ?? "GPS no disponible." });
}

/** Llamar al detener el watcher (salir de órbita). */
export function gpsSetUnknown(): void {
  emit({ status: "unknown", errorMessage: null });
}
