/**
 * lib/geo.ts — Geolocation universal: Capacitor nativo en dispositivo, Web API en browser.
 *
 * Interface pública idéntica a navigator.geolocation para que los callers
 * no necesiten conocer el entorno de ejecución.
 *
 * Web:     delegación directa a navigator.geolocation (sin cambios de comportamiento)
 * Nativo:  @capacitor/geolocation — mismo contrato, mayor precisión y confiabilidad
 *
 * Uso:
 *   import { geoGetCurrentPosition, geoWatchPosition, geoClearWatch, geoIsAvailable } from "@/lib/geo";
 */

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

// ── Tipos (alias para claridad) ───────────────────────────────────────────────

type GeoSuccess = PositionCallback;
type GeoError   = PositionErrorCallback;
type GeoOptions = PositionOptions;

// ── Detección de entorno ──────────────────────────────────────────────────────

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// ── Conversión de Position de Capacitor → GeolocationPosition estándar ───────

function toStdPosition(pos: Awaited<ReturnType<typeof Geolocation.getCurrentPosition>>): GeolocationPosition {
  return {
    coords: {
      latitude:         pos.coords.latitude,
      longitude:        pos.coords.longitude,
      accuracy:         pos.coords.accuracy,
      altitude:         pos.coords.altitude   ?? null,
      altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
      heading:          pos.coords.heading    ?? null,
      speed:            pos.coords.speed      ?? null,
      toJSON() { return this; },
    },
    timestamp: pos.timestamp,
    toJSON() { return this; },
  };
}

function toStdError(err: unknown): GeolocationPositionError {
  const e = err as { code?: number; message?: string };
  const code = e.code ?? GeolocationPositionError.POSITION_UNAVAILABLE;
  return {
    code,
    message:            e.message ?? "Geolocation error",
    PERMISSION_DENIED:  GeolocationPositionError.PERMISSION_DENIED,
    POSITION_UNAVAILABLE: GeolocationPositionError.POSITION_UNAVAILABLE,
    TIMEOUT:            GeolocationPositionError.TIMEOUT,
  };
}

// ── API pública ───────────────────────────────────────────────────────────────

/** True si la geolocalización está disponible en el entorno actual. */
export function geoIsAvailable(): boolean {
  if (isNative()) return true;
  return typeof navigator !== "undefined" && Boolean(navigator.geolocation);
}

/**
 * Obtiene la posición actual. Misma firma que navigator.geolocation.getCurrentPosition.
 * En nativo usa Capacitor; en web delega al browser.
 */
export function geoGetCurrentPosition(
  success: GeoSuccess,
  error?: GeoError | null,
  options?: GeoOptions,
): void {
  if (isNative()) {
    Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout:            options?.timeout,
      maximumAge:         options?.maximumAge,
    })
      .then((pos) => success(toStdPosition(pos)))
      .catch((err: unknown) => error?.(toStdError(err)));
    return;
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    error?.({
      code: GeolocationPositionError.POSITION_UNAVAILABLE,
      message: "Geolocation not available",
      PERMISSION_DENIED:    GeolocationPositionError.PERMISSION_DENIED,
      POSITION_UNAVAILABLE: GeolocationPositionError.POSITION_UNAVAILABLE,
      TIMEOUT:              GeolocationPositionError.TIMEOUT,
    });
    return;
  }

  navigator.geolocation.getCurrentPosition(success, error ?? undefined, options);
}

/**
 * Inicia un watcher de posición. Devuelve un id para cancelar con geoClearWatch.
 * En nativo usa Capacitor (id es un string); en web usa browser (id es un number).
 * El caller solo necesita pasar el id opaco a geoClearWatch — no inspeccionarlo.
 */
export function geoWatchPosition(
  success: GeoSuccess,
  error?: GeoError | null,
  options?: GeoOptions,
): string | number {
  if (isNative()) {
    let callbackId = "";

    Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout:            options?.timeout,
        maximumAge:         options?.maximumAge,
      },
      (pos, err) => {
        if (err) {
          error?.(toStdError(err));
          return;
        }
        if (pos) success(toStdPosition(pos));
      },
    ).then((id) => { callbackId = id; });

    // Capacitor's watchPosition is async for the ID — the callback fires after.
    // We expose a sentinel that geoClearWatch resolves via a registry.
    const token = `cap-watch-${Date.now()}`;
    _watchRegistry.set(token, () => { void Geolocation.clearWatch({ id: callbackId }); });
    return token;
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) return -1;
  return navigator.geolocation.watchPosition(success, error ?? undefined, options);
}

/**
 * Cancela un watcher previamente abierto con geoWatchPosition.
 */
export function geoClearWatch(id: string | number): void {
  if (isNative()) {
    const cleanup = _watchRegistry.get(id as string);
    if (cleanup) { cleanup(); _watchRegistry.delete(id as string); }
    return;
  }
  if (typeof navigator !== "undefined" && navigator.geolocation && typeof id === "number") {
    navigator.geolocation.clearWatch(id);
  }
}

// Registro interno para watch tokens nativos
const _watchRegistry = new Map<string, () => void>();
