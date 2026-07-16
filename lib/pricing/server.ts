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
};

export type QuoteResult = {
  serviceFee: number;
  totalAmount: number;
  subtotalProductos: number | null;
  pricingRule: string;
  distanceKm: number | null;
  segment: "agente_origen" | "origen_destino";
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

export async function loadMotorParams(): Promise<{ params: DirectParams; source: "db" | "fallback"; version: number | null }> {
  const fallback: DirectParams = {
    tarifaBase:     DIRECT.tarifaBase,
    costoPorKm:     DIRECT.costoPorKm,
    comisionAgente: DIRECT.comisionAgente,
  };
  const admin = getAdmin();
  if (!admin) return { params: fallback, source: "fallback", version: null };

  try {
    const [paramsRes, histRes] = await Promise.all([
      admin.from("motor_params").select("key, value").eq("scope", "zumpahuacan"),
      admin.from("motor_params_history").select("id").eq("scope", "zumpahuacan")
        .order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (paramsRes.error || !paramsRes.data?.length) {
      console.warn("[pricing/server] motor_params no disponible, usando fallback:", paramsRes.error?.message);
      return { params: fallback, source: "fallback", version: null };
    }

    const map = new Map(paramsRes.data.map((r) => [r.key as string, Number(r.value)]));
    const raw = {
      tarifaBase:     map.get("tarifa_base"),
      costoPorKm:     map.get("costo_por_km"),
      comisionAgente: map.get("comision_agente"),
    };
    const invalid = Object.entries(raw)
      .filter(([, v]) => v == null || !Number.isFinite(v) || v <= 0)
      .map(([k]) => k);

    if (invalid.length > 0) {
      console.warn("[pricing/server] Parámetros inválidos en motor_params, usando fallback para:", invalid);
      return { params: fallback, source: "fallback", version: null };
    }

    const version = (histRes.data as { id: number } | null)?.id ?? null;
    return { params: raw as DirectParams, source: "db", version };
  } catch (err) {
    console.warn("[pricing/server] Error leyendo motor_params, usando fallback:", err);
    return { params: fallback, source: "fallback", version: null };
  }
}

export async function computeQuote(input: QuoteInput): Promise<QuoteResult & { motorParamsVersion: number | null }> {
  const {
    isCatalog, agentLat, agentLng,
    originLat, originLng, destinationLat, destinationLng,
    clientDistanceKm, serviceType,
  } = input;

  if (isCatalog) {
    let pricingDistanceKm: number | null = null;
    if (originLat != null && originLng != null && destinationLat != null && destinationLng != null) {
      const serverH = haversineKmServer(originLat, originLng, destinationLat, destinationLng);
      pricingDistanceKm = resolveDistanceServer(clientDistanceKm, serverH);
    }
    const result = calcularMisionCatalogo(pricingDistanceKm, 0, serviceType);
    return {
      serviceFee:        result.servicioOrbi,
      totalAmount:       result.servicioOrbi,
      subtotalProductos: null,
      pricingRule:       PRICING_RULE,
      distanceKm:        pricingDistanceKm,
      segment:           "origen_destino",
      motorParamsVersion: null,
    };
  }

  // Misión directa — distancia agente→origen
  let agentToOriginKm: number | null = null;
  if (agentLat != null && agentLng != null && originLat != null && originLng != null) {
    agentToOriginKm = haversineKmServer(agentLat, agentLng, originLat, originLng);
  }

  const { params: motorParams, version } = await loadMotorParams();
  const result = estimateMissionCost(agentToOriginKm, motorParams);

  return {
    serviceFee:        result.price,
    totalAmount:       result.price,
    subtotalProductos: null,
    pricingRule:       PRICING_RULE,
    distanceKm:        agentToOriginKm,
    segment:           "agente_origen",
    motorParamsVersion: version,
  };
}
