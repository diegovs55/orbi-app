/**
 * GET /api/geocoding/search
 *
 * Proxy entre el browser y Photon (Komoot) para autocompletar lugares.
 * Nunca llama a Nominatim (INV-018).
 * Nunca es llamado directamente desde el browser al proveedor (INV-017).
 * Sin hardcodes geográficos en la query (INV-020).
 *
 * Parámetros:
 *   q     — texto de búsqueda (obligatorio)
 *   lang  — idioma ISO 639-1 (opcional, default "es")
 *   limit — máx resultados 1-10 (opcional, default 5, clamp silencioso)
 *   lat   — latitud del SearchCenter (opcional; lat=0 es válido, INV-016)
 *   lon   — longitud del SearchCenter (opcional; lon=0 es válido, INV-016)
 *
 * Respuestas:
 *   200 { results: PlaceResult[] }
 *   200 { results: [], status: "unavailable", fallbackAvailable: true }  ← proveedor caído
 *   400 { error: string }
 *   500 { error: "Internal server error" }
 *
 * DA-014: HTTP 200 aunque el proveedor falle.
 * DA-011: caché in-memory best-effort, no compartida entre instancias Vercel.
 */

import { NextRequest, NextResponse } from "next/server";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PlaceResult {
  providerId: string;   // "photon:{osmType}:{osmId}"
  displayName: string;
  lat: number;
  lon: number;
  osmType: string;      // "N" | "W" | "R"
  osmId: number;
  type: string | null;  // "house" | "street" | "city" | null
}

interface SearchResponse {
  results: PlaceResult[];
  status?: "unavailable";
  fallbackAvailable?: true;
}

// Forma del GeoJSON que devuelve Photon
interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    country?: string;
    type?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

// ── Caché ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: PlaceResult[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
// Valor provisional — ajustar con evidencia operativa real (DA-011).
// No asumir que 5 minutos es el TTL correcto para producción.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

function cacheGet(key: string): PlaceResult[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: PlaceResult[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Eliminar la primera entrada (la más antigua insertada)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Construcción de displayName ───────────────────────────────────────────────

function buildDisplayName(props: PhotonFeature["properties"]): string | null {
  const name = props.name?.trim() || "";
  const street = props.street?.trim() || "";
  const housenumber = props.housenumber?.trim() || "";
  const district = props.district?.trim() || "";
  const city = props.city?.trim() || "";

  // Descartar resultado sin nombre ni calle (R-4)
  if (!name && !street) return null;

  const streetWithNumber = housenumber ? `${street} ${housenumber}`.trim() : street;

  return [name, streetWithNumber, district, city]
    .filter(Boolean)
    .join(", ");
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse<SearchResponse | { error: string }>> {
  try {
    const params = new URL(req.url).searchParams;

    // Validar q
    const q = (params.get("q") ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "q is required" }, { status: 400 });
    }

    // lang — Photon solo soporta "default" | "de" | "en" | "fr".
    // Para español y cualquier otro idioma no soportado, usar "default"
    // (devuelve el nombre OSM en el idioma local del lugar, que en México es español).
    const PHOTON_SUPPORTED_LANGS = new Set(["default", "de", "en", "fr"]);
    const rawLang = (params.get("lang") ?? "").trim();
    const lang = PHOTON_SUPPORTED_LANGS.has(rawLang) ? rawLang : "default";

    // limit — clamp silencioso al rango [1, 10]
    const rawLimit = parseInt(params.get("limit") ?? "5", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(10, Math.max(1, rawLimit)) : 5;

    // lat / lon opcionales — no validar, no rechazar 0 (INV-016, INV-019)
    const latParam = params.get("lat");
    const lonParam = params.get("lon");
    const lat = latParam !== null ? parseFloat(latParam) : null;
    const lon = lonParam !== null ? parseFloat(lonParam) : null;

    // Clave de caché: incluye contexto geográfico porque la misma query
    // con distinto centro produce resultados diferentes
    const cacheKey = `${q}|${lang}|${limit}|${lat ?? ""}|${lon ?? ""}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json({ results: cached });
    }

    // Construir URL de Photon (INV-020: solo q sin inyección geográfica)
    const photonUrl = new URL("https://photon.komoot.io/api/");
    photonUrl.searchParams.set("q", q);
    photonUrl.searchParams.set("lang", lang);
    photonUrl.searchParams.set("limit", String(limit));
    if (lat !== null && Number.isFinite(lat)) photonUrl.searchParams.set("lat", String(lat));
    if (lon !== null && Number.isFinite(lon)) photonUrl.searchParams.set("lon", String(lon));

    // Llamada a Photon con timeout de 4 segundos
    let photonData: PhotonResponse;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(photonUrl.toString(), {
        headers: { "User-Agent": "orbi-geocoding/1.0" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Proveedor devolvió error HTTP → DA-014
        return NextResponse.json(
          { results: [], status: "unavailable", fallbackAvailable: true },
          { status: 200 }
        );
      }

      photonData = (await response.json()) as PhotonResponse;
    } catch {
      // Timeout o error de red → DA-014
      return NextResponse.json(
        { results: [], status: "unavailable", fallbackAvailable: true },
        { status: 200 }
      );
    }

    // Transformar resultados
    const results: PlaceResult[] = [];

    for (const feature of photonData.features ?? []) {
      const props = feature.properties ?? {};
      const osmType = props.osm_type ?? "";
      const osmId = props.osm_id ?? 0;

      // provider_id requiere osm_type y osm_id válidos
      if (!osmType || !osmId) continue;

      const displayName = buildDisplayName(props);
      // Descartar resultado sin nombre útil (R-4)
      if (!displayName) continue;

      const [lon, lat] = feature.geometry?.coordinates ?? [0, 0];

      results.push({
        providerId: `photon:${osmType}:${osmId}`,
        displayName,
        lat,
        lon,
        osmType,
        osmId,
        type: props.type ?? null,
      });
    }

    // Solo cachear respuestas exitosas (no cachear indisponibilidad)
    cacheSet(cacheKey, results);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[geocoding/search] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
