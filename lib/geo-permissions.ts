/**
 * lib/geo-permissions.ts — Gestión de permisos de geolocalización.
 *
 * En nativo usa @capacitor/geolocation Permissions API (sin abrir diálogo del sistema).
 * En web usa navigator.permissions cuando está disponible.
 *
 * Estados posibles:
 *   granted   — permiso concedido, puede usar GPS
 *   prompt    — no se ha preguntado aún (incluye "prompt-with-rationale" de Android)
 *   denied    — denegado; en Android puede ser temporal o permanente
 *   unavailable — API de geolocalización no presente
 */

import { Capacitor } from "@capacitor/core";

export type GeoPermissionState = "granted" | "prompt" | "denied" | "unavailable";

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Comprueba el estado actual del permiso SIN abrir el diálogo del sistema.
 */
export async function checkGpsPermission(): Promise<GeoPermissionState> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const status = await Geolocation.checkPermissions();
      const state = status.location;
      if (state === "granted") return "granted";
      if (state === "denied")  return "denied";
      // "prompt" | "prompt-with-rationale"
      return "prompt";
    } catch {
      return "unavailable";
    }
  }

  // Web path
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "unavailable";
  }
  if (!navigator.permissions?.query) return "prompt"; // no Permissions API — assume prompt
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    if (result.state === "granted") return "granted";
    if (result.state === "denied")  return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Solicita el permiso al usuario. En nativo dispara el diálogo del sistema.
 * Debe llamarse SOLO desde un gesto directo del usuario.
 */
export async function requestGpsPermission(): Promise<GeoPermissionState> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const status = await Geolocation.requestPermissions({ permissions: ["location"] });
      const state = status.location;
      if (state === "granted") return "granted";
      if (state === "denied")  return "denied";
      return "prompt";
    } catch {
      return "unavailable";
    }
  }

  // En web no hay API separada de request — getCurrentPosition dispara el diálogo.
  // Retornamos el estado actual; el caller debe proceder con getCurrentPosition.
  return checkGpsPermission();
}

/**
 * Abre la pantalla de configuración de la app para que el usuario pueda
 * cambiar el permiso manualmente (solo cuando está denegado permanentemente).
 * En web redirige a la ayuda del navegador.
 */
export async function openGpsSettings(): Promise<void> {
  if (isNative()) {
    try {
      // NativeSettings no está instalado en MOBILE-03 — usamos App.openUrl como fallback.
      // En iOS el url "app-settings:" abre la pantalla de permisos de la app.
      // En Android no hay URL directa; Capacitor App.openUrl no está garantizado,
      // pero el diálogo nativo de "denegado permanentemente" ya lleva al usuario ahí.
      const platform = Capacitor.getPlatform();
      if (platform === "ios") {
        // En iOS el scheme "app-settings:" lleva al panel de permisos de la app.
        // Se abre con window.open porque App.openUrl no está disponible en Capacitor 8.
        window.open("app-settings:", "_system");
      }
      // Android: no hay URL canónica — la UI debe instruir al usuario
    } catch {
      // Silencioso — la UI mostrará instrucciones textuales
    }
    return;
  }
  // Web: no hay configuración de app — solo instrucciones en la UI
}
