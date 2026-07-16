/**
 * GET /api/geocoding/reverse
 *
 * Proxy entre el browser y Nominatim (OSM) para geocodificación inversa.
 * Nunca llama a Photon (INV-018 — Nominatim solo para reverse).
 * Nunca es llamado directamente desde el browser al proveedor (INV-017).
 * Sin hardcodes geográficos (INV-020).
 *
 * Parámetros:
 *   lat  — latitud (obligatorio; lat=0 es válido, INV-016)
 *   lon  — longitud (obligatorio; lon=0 es válido, INV-016)
 *   lang — idioma ISO 639-1 para Nominatim (opcional, default "es")
 *
 * Respuestas:
 *   200 { displayName: string }          ← Nominatim encontró nombre
 *   200 { displayName: null }            ← coordenadas válidas, sin nombre OSM
 *   200 { results: [], status: "unavailable", fallbackAvailable: true }  ← proveedor caído
 *   400 { error: string }
 *   500 { error: "Internal server error" }
 *
 * Regla de presentación: este endpoint nunca inventa texto de fallback.
 * Si Nominatim no devuelve un nombre, devuelve displayName: null.
 * La decisión de mostrar "Ubicación actual", "Punto marcado en el mapa"
 * u otro texto es exclusiva de la capa de presentación.
 *
 * DA-014: HTTP 200 aunque el proveedor falle.
 * DA-011: caché in-memory best-effort, no compartida entre instancias Vercel.
 */

import { NextRequest, NextResponse } from "next/server";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ReverseSuccessResponse {
  displayName: string | null;
}

interface ReverseUnavailableResponse {
  results: [];
  status: "unavailable";
  fallbackAvailable: true;
}

type ReverseResponse = ReverseSuccessResponse | ReverseUnavailableResponse;

// Forma relevante de la respuesta de Nominatim (format=jsonv2)
interface NominatimResponse {
  display_name?: string;
  error?: string;
}

// ── Caché ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  displayName: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
// Valor provisional — ajustar con evidencia operativa real (DA-011).
// Los resultados de reverse son más estables que los de search,
// pero 10 minutos no está validado en producción.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

function cacheGet(key: string): { hit: true; displayName: string | null } | { hit: false } {
  const entry = cache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return { hit: false };
  }
  return { hit: true, displayName: entry.displayName };
}

function cacheSet(key: string, displayName: string | null): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { displayName, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse<ReverseResponse | { error: string }>> {
  try {
    const params = new URL(req.url).searchParams;

    // Validar lat y lon: deben estar presentes y ser números finitos.
    // lat=0 y lon=0 son coordenadas válidas (INV-016) — no rechazar.
    const latParam = params.get("lat");
    const lonParam = params.get("lon");

    if (latParam === null || lonParam === null) {
      return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
    }

    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "lat and lon must be finite numbers" }, { status: 400 });
    }

    // lang — Nominatim acepta ISO 639-1 vía header Accept-Language.
    // No hay restricción de valores como en Photon; se pasa tal cual.
    const lang = (params.get("lang") ?? "es").trim() || "es";

    // Clave de caché: coordenadas + idioma
    const cacheKey = `${lat}|${lon}|${lang}`;
    const cached = cacheGet(cacheKey);
    if (cached.hit) {
      return NextResponse.json({ displayName: cached.displayName });
    }

    // Construir URL de Nominatim (INV-020: sin parámetros geográficos inyectados)
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    nominatimUrl.searchParams.set("format", "jsonv2");
    nominatimUrl.searchParams.set("lat", String(lat));
    nominatimUrl.searchParams.set("lon", String(lon));
    nominatimUrl.searchParams.set("zoom", "18"); // detalle máximo: número + calle + colonia

    // Llamada a Nominatim con timeout de 5 segundos
    let nominatimData: NominatimResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(nominatimUrl.toString(), {
        headers: {
          // User-Agent obligatorio por política de uso de Nominatim.
          // Sin él, Nominatim puede bloquear la IP del servidor.
          "User-Agent": "orbi-geocoding/1.0",
          "Accept-Language": lang,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Proveedor devolvió error HTTP → DA-014
        return NextResponse.json(
          { results: [] as [], status: "unavailable" as const, fallbackAvailable: true as const },
          { status: 200 }
        );
      }

      nominatimData = (await response.json()) as NominatimResponse;
    } catch {
      // Timeout o error de red → DA-014
      return NextResponse.json(
        { results: [] as [], status: "unavailable" as const, fallbackAvailable: true as const },
        { status: 200 }
      );
    }

    // Extraer displayName.
    // Si Nominatim devuelve { error: "Unable to geocode" } o display_name vacío
    // → displayName es null. El endpoint no inventa texto alternativo.
    const rawName = nominatimData.display_name?.trim() ?? "";
    const displayName = !nominatimData.error && rawName.length > 0 ? rawName : null;

    // Cachear tanto nombres encontrados como ausencia de nombre (displayName: null).
    // No cachear indisponibilidad del proveedor.
    cacheSet(cacheKey, displayName);

    return NextResponse.json({ displayName });
  } catch (err) {
    console.error("[geocoding/reverse] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
