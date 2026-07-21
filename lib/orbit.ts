/**
 * Modelo de órbita — G2
 *
 * OrbitCenter es el centro de búsqueda/descubrimiento del catálogo.
 * Es independiente de: la ubicación física del solicitante, el origen
 * operativo del negocio y el destino de cumplimiento.
 *
 * No se envía a ningún endpoint. No se persiste en DB.
 */

export type OrbitCenterSource =
  | "gps_suggested"  // GPS leído automáticamente con permiso previo — sin confirmación explícita
  | "manual"         // el usuario eligió explícitamente: texto, mapa o botón
  | "saved"          // ubicación guardada en perfil (evolución futura — no MVP)
  | "recent"         // usada recientemente (evolución futura — no MVP)
  | "env_default";   // zona predeterminada por vars de entorno — solo dev o con aviso visible

export type OrbitCenter = {
  lat: number;
  lng: number;
  label: string;      // nombre legible para mostrar al usuario
  source: OrbitCenterSource;
};

export type OrbitResolutionResult =
  | { status: "resolved"; center: OrbitCenter }
  | { status: "prompt" }       // permiso no concedido aún — no disparar diálogo automático
  | { status: "denied" }       // permiso denegado explícitamente
  | { status: "unavailable" }  // API de geolocalización ausente
  | { status: "unsupported" }  // Permissions API ausente — no podemos determinar el estado sin preguntar
  | { status: "timeout" }      // GPS no respondió a tiempo
  | { status: "error"; message: string };

const GPS_TIMEOUT_MS = 5000;

/**
 * Valida que las coordenadas sean utilizables como centro de órbita.
 * Coordenadas inválidas nunca deben producir una órbita.
 */
function areValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

/**
 * Intenta determinar el estado del permiso de geolocalización SIN disparar
 * el diálogo del sistema.
 *
 * Compatibilidad:
 *   - Chrome/Edge/Firefox: navigator.permissions.query({ name: "geolocation" })
 *   - Safari iOS < 16: navigator.permissions ausente → retorna "unsupported"
 *   - Safari iOS ≥ 16: navigator.permissions presente pero puede lanzar excepción
 *     al consultar "geolocation" → capturado y retorna "unsupported"
 *   - navigator.permissions.query ausente → retorna "unsupported"
 *
 * Retorna "unsupported" cuando no es posible determinar el estado sin preguntar.
 * Nunca llama getCurrentPosition.
 */
async function queryGeolocationPermission(): Promise<PermissionState | "unsupported"> {
  if (
    typeof navigator === "undefined" ||
    !navigator.permissions ||
    typeof navigator.permissions.query !== "function"
  ) {
    return "unsupported";
  }

  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    // Safari puede lanzar TypeError para algunos nombres de permiso.
    return "unsupported";
  }
}

/**
 * Intenta obtener la órbita inicial desde el GPS del dispositivo.
 *
 * Política:
 *   - Solo llama getCurrentPosition si el permiso es definitivamente "granted".
 *   - En cualquier otro caso (prompt / denied / unsupported / sin API) retorna
 *     sin abrir el diálogo del sistema.
 *
 * Timeouts:
 *   - GPS_TIMEOUT_MS se pasa tanto al timer interno como a la opción timeout
 *     de getCurrentPosition. La promesa resuelve una sola vez: el primero que
 *     llegue (posición o timeout) limpia el temporizador del otro.
 *
 * Reverse geocoding:
 *   - No implementado en esta fase. El label siempre es "Mi ubicación".
 *   - Las coordenadas son autoritativas; el label es solo presentación.
 */
export async function resolveOrbitFromGps(): Promise<OrbitResolutionResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "unavailable" };
  }

  const permissionState = await queryGeolocationPermission();

  // Si no es "granted", no llamamos getCurrentPosition.
  if (permissionState === "prompt")     return { status: "prompt" };
  if (permissionState === "denied")     return { status: "denied" };
  if (permissionState === "unsupported") return { status: "unsupported" };
  // permissionState === "granted" — continuar a leer coordenadas.

  return new Promise((resolve) => {
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timeout" });
    }, GPS_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!areValidCoords(lat, lng)) {
          resolve({ status: "error", message: "Coordenadas GPS fuera de rango." });
          return;
        }

        resolve({
          status: "resolved",
          center: {
            lat,
            lng,
            // Reverse geocoding no implementado. Las coords son autoritativas;
            // el Bloque 2 puede enriquecer el label cuando tenga picker.
            label: "Mi ubicación",
            source: "gps_suggested",
          },
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        if (err.code === err.PERMISSION_DENIED) {
          resolve({ status: "denied" });
        } else if (err.code === err.TIMEOUT) {
          resolve({ status: "timeout" });
        } else {
          resolve({ status: "error", message: err.message });
        }
      },
      { timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

/**
 * Solicita GPS explícitamente, con confirmación del usuario (dispara el diálogo del sistema).
 * Solo debe llamarse desde un gesto directo del usuario ("Usar mi ubicación").
 * A diferencia de resolveOrbitFromGps(), no consulta permisos primero:
 * si el permiso es "prompt", el navegador mostrará el diálogo nativo.
 */
export async function resolveOrbitFromGpsExplicit(): Promise<OrbitResolutionResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "unavailable" };
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timeout" });
    }, GPS_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!areValidCoords(lat, lng)) {
          resolve({ status: "error", message: "Coordenadas GPS fuera de rango." });
          return;
        }

        resolve({
          status: "resolved",
          center: { lat, lng, label: "Mi ubicación", source: "gps_suggested" },
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);

        if (err.code === err.PERMISSION_DENIED) {
          resolve({ status: "denied" });
        } else if (err.code === err.TIMEOUT) {
          resolve({ status: "timeout" });
        } else {
          resolve({ status: "error", message: err.message });
        }
      },
      { timeout: GPS_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

/**
 * Retorna una OrbitCenter predeterminada desde las variables de entorno.
 * SOLO debe usarse en entorno de desarrollo o con aviso explícito al usuario.
 * En producción sin GPS, la UI debe ofrecer picker manual — no usar como fallback silencioso.
 */
export function getEnvDefaultOrbit(): OrbitCenter | null {
  const lat = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "");
  const lng = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "");
  const label = process.env.NEXT_PUBLIC_DEFAULT_ZONE_LABEL ?? "";
  if (!areValidCoords(lat, lng)) return null;
  return { lat, lng, label: label || "Zona predeterminada", source: "env_default" };
}
