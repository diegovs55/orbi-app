/**
 * lib/pricing/server.ts — Motor de cotización autorizado.
 *
 * Server-only. Usa supabase-admin y motor_params de DB.
 * No importar desde componentes cliente.
 *
 * Única fuente de verdad para el precio de una misión.
 * Reutilizada por /api/pricing/quote y /api/missions/create.
 */

import { getAdmin } from "@/lib/supabase-admin";
import { DIRECT, PRICING_RULE } from "./config";
import { estimateMissionCost } from "./direct";
import { calcularMisionCatalogo } from "./catalog";
import type { DirectParams } from "./direct";

export type QuoteInput = {
  isCatalog: boolean;
  agentLat: number | null;
  agentLng: number | null;
  originLat: number | null;
  originLng: number | null;
  destinationLat: number | null;
  destinationLng: number | null;
  clientDistanceKm: number | null;
  items: Array<{ product_id: string; quantity: number }>;
  serviceType: string;
  // Permite inyectar params ya cargados para evitar una segunda lectura a DB.
  // Si se provee, computeQuote omite su loadMotorParams() interno.
  preloadedMotorData?: { params: MotorParams; version: number | null };
};

export type QuoteResult = {
  serviceFee: number;
  totalAmount: number;
  subtotalProductos: number | null;
  pricingRule: string;
  distanceKm: number | null;
  segment: "origen_destino";
};

export type MotorParams = DirectParams & {
  radioServicioMaximoKm:      number;
  radioAsignacionAutomaticaKm: number;
  radioAsignacionMaximaKm:    number;
};

export function haversineKmServer(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveDistanceServer(
  clientKm: number | null,
  serverHaversine: number,
): number {
  if (clientKm == null || !Number.isFinite(clientKm) || clientKm <= 0) return serverHaversine;
  const ratio = clientKm / serverHaversine;
  return ratio >= 0.75 && ratio <= 1.25 ? clientKm : serverHaversine;
}

const IS_PROD = process.env.NODE_ENV === "production";

// Fallback de dev/test: valores sincronizados con seeds de motor_params.
// En producción nunca se usa — un fallo de DB es un fallo cerrado (A3).
const FALLBACK_MOTOR: MotorParams = {
  tarifaBase:                  DIRECT.tarifaBase,
  costoPorKm:                  DIRECT.costoPorKm,
  comisionAgente:              DIRECT.comisionAgente,
  tarifaMinima:                DIRECT.tarifaMinima,
  radioServicioMaximoKm:       30,  // A2.1 — sincronizado con migración 20260720_a2_radio_servicio_v2
  radioAsignacionAutomaticaKm:  3,
  radioAsignacionMaximaKm:      8,
};

export async function loadMotorParams(
  scope: string,
): Promise<{ params: MotorParams; source: "db" | "fallback"; version: number | null }> {
  const admin = getAdmin();

  // A3: sin cliente admin no hay cotización en producción.
  if (!admin) {
    if (IS_PROD) throw new Error("[pricing/server] Admin client no disponible en producción.");
    return { params: FALLBACK_MOTOR, source: "fallback", version: null };
  }

  try {
    const [paramsRes, histRes] = await Promise.all([
      admin
        .from("motor_params")
        .select("key, value")
        .eq("scope", scope)
        .in("key", [
          "tarifa_base",
          "costo_por_km",
          "comision_agente",
          "tarifa_minima",
          "radio_servicio_maximo_km",
          "radio_asignacion_automatica_km",
          "radio_asignacion_maxima_km",
        ]),
      admin
        .from("motor_params_history")
        .select("id")
        .eq("scope", scope)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // A3: fallo de DB es fallo cerrado en producción.
    if (paramsRes.error) {
      if (IS_PROD) throw new Error(`[pricing/server] Error leyendo motor_params: ${paramsRes.error.message}`);
      console.warn("[pricing/server] DB no disponible, usando fallback (dev/test):", paramsRes.error.message);
      return { params: FALLBACK_MOTOR, source: "fallback", version: null };
    }

    if (!paramsRes.data?.length) {
      if (IS_PROD) throw new Error(`[pricing/server] motor_params vacío para scope '${scope}'.`);
      console.warn(`[pricing/server] Scope '${scope}' sin parámetros, usando fallback (dev/test).`);
      return { params: FALLBACK_MOTOR, source: "fallback", version: null };
    }

    const map = new Map(paramsRes.data.map((r) => [r.key as string, Number(r.value)]));

    const raw: MotorParams = {
      tarifaBase:                  map.get("tarifa_base")                    ?? 0,
      costoPorKm:                  map.get("costo_por_km")                   ?? 0,
      comisionAgente:              map.get("comision_agente")                ?? 0,
      tarifaMinima:                map.get("tarifa_minima")                  ?? 0,
      radioServicioMaximoKm:       map.get("radio_servicio_maximo_km")       ?? 0,
      radioAsignacionAutomaticaKm: map.get("radio_asignacion_automatica_km") ?? 0,
      radioAsignacionMaximaKm:     map.get("radio_asignacion_maxima_km")     ?? 0,
    };

    const invalid = (Object.entries(raw) as [string, number][])
      .filter(([, v]) => !Number.isFinite(v) || v <= 0)
      .map(([k]) => k);

    if (invalid.length > 0) {
      if (IS_PROD) throw new Error(`[pricing/server] Parámetros inválidos en scope '${scope}': ${invalid.join(", ")}`);
      console.warn("[pricing/server] Parámetros inválidos, usando fallback (dev/test):", invalid);
      return { params: FALLBACK_MOTOR, source: "fallback", version: null };
    }

    const version = (histRes.data as { id: number } | null)?.id ?? null;
    return { params: raw, source: "db", version };
  } catch (err) {
    if (IS_PROD) throw err;
    console.warn("[pricing/server] Error inesperado, usando fallback (dev/test):", err);
    return { params: FALLBACK_MOTOR, source: "fallback", version: null };
  }
}

export async function computeQuote(
  input: QuoteInput,
): Promise<QuoteResult & { motorParamsVersion: number | null }> {
  const {
    isCatalog,
    originLat, originLng,
    destinationLat, destinationLng,
    clientDistanceKm, serviceType,
    preloadedMotorData,
  } = input;

  // Principio de resolución geográfica: scope determinado por origen de la misión.
  // Para el piloto, scope fijo 'zumpahuacan'. El resolver geográfico completo es Fase futura.
  const scope = "zumpahuacan";

  // A4: sin coordenadas válidas no hay distancia ni cotización.
  const hasCoords =
    originLat != null && originLng != null &&
    destinationLat != null && destinationLng != null;

  if (!hasCoords) {
    throw new Error("[pricing/server] Coordenadas de origen o destino ausentes. No se puede cotizar sin distancia real (A4).");
  }

  const serverHaversine = haversineKmServer(originLat!, originLng!, destinationLat!, destinationLng!);
  const pricingDistanceKm = resolveDistanceServer(clientDistanceKm, serverHaversine);

  if (isCatalog) {
    const result = calcularMisionCatalogo(pricingDistanceKm, 0, serviceType);
    return {
      serviceFee:         result.servicioOrbi,
      totalAmount:        result.servicioOrbi,
      subtotalProductos:  null,
      pricingRule:        PRICING_RULE,
      distanceKm:         pricingDistanceKm,
      segment:            "origen_destino",
      motorParamsVersion: null,
    };
  }

  // Misión directa — DEC-16-B sobre distancia origin→destination.
  const { params: motorParams, version } = preloadedMotorData ?? await loadMotorParams(scope);
  const result = estimateMissionCost(pricingDistanceKm, motorParams);

  return {
    serviceFee:         result.price,
    totalAmount:        result.price,
    subtotalProductos:  null,
    pricingRule:        PRICING_RULE,
    distanceKm:         pricingDistanceKm,
    segment:            "origen_destino",
    motorParamsVersion: version,
  };
}
