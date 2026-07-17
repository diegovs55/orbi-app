import { DIRECT, PRICING_RULE, POR_SERVICIO, type MissionPriceResult } from "./config";

// Parámetros activos del motor directo.
// Inyectados desde motor_params en producción; DIRECT es el fallback de dev/test.
export interface DirectParams {
  tarifaBase:     number;
  costoPorKm:     number;
  comisionAgente: number;
  tarifaMinima:   number;
}

export function calcularMisionDirecta(
  distanceKm: number | null,
  serviceType?: string,
  params?: DirectParams,
): MissionPriceResult {
  const p = params ?? DIRECT;

  // A4: no inventar distancia. Sin coordenadas válidas no hay cotización.
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return {
      subtotalProductos: null,
      servicioOrbi: 0,
      totalCliente: 0,
      costoAgente: 0,
      gananciaOrbi: 0,
      pricingRule: PRICING_RULE,
      distanciaAgente_negocio_km: null,
      distanciaNegocio_cliente_km: null,
    };
  }

  const multiplicador = serviceType != null ? (POR_SERVICIO[serviceType]?.multiplicador ?? 1.0) : 1.0;

  // DEC-16-B: serviceFee = max(tarifa_base + costo_por_km × km, tarifa_minima)
  const raw          = (p.tarifaBase + distanceKm * p.costoPorKm) * multiplicador;
  const servicioOrbi = Math.round(Math.max(raw, p.tarifaMinima));
  const costoAgente  = Math.round(servicioOrbi * p.comisionAgente);
  const gananciaOrbi = servicioOrbi - costoAgente;

  return {
    subtotalProductos: null,
    servicioOrbi,
    totalCliente: servicioOrbi,
    costoAgente,
    gananciaOrbi,
    pricingRule: PRICING_RULE,
    distanciaAgente_negocio_km: null,
    distanciaNegocio_cliente_km: distanceKm,
  };
}

export function estimateMissionCost(distance: number | null, params?: DirectParams) {
  const result = calcularMisionDirecta(distance, undefined, params);
  return {
    price: result.servicioOrbi,
    agentCost: result.costoAgente,
    orbiProfit: result.gananciaOrbi,
  };
}
