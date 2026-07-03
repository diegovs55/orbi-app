import { DIRECT, PRICING_RULE, POR_SERVICIO, type MissionPriceResult } from "./config";

/**
 * Calcula el precio de una misión directa (Mandado, Mensajería, etc.).
 * Misma lógica que la anterior `estimateMissionCost()` en ServiceRequestFlow.
 */
export function calcularMisionDirecta(
  distanceKm: number | null,
  serviceType?: string
): MissionPriceResult {
  const safeDistance = distanceKm ?? 3;
  const multiplicador = serviceType != null ? (POR_SERVICIO[serviceType]?.multiplicador ?? 1.0) : 1.0;

  const servicioOrbi = Math.round((DIRECT.tarifaBase + safeDistance * DIRECT.costoPorKm) * multiplicador);
  const costoAgente = Math.round(servicioOrbi * DIRECT.comisionAgente);
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

/**
 * Alias de compatibilidad con la forma que ServiceRequestFlow consumía antes:
 * { price, agentCost, orbiProfit }
 */
export function estimateMissionCost(distance: number | null) {
  const result = calcularMisionDirecta(distance);
  return {
    price: result.servicioOrbi,
    agentCost: result.costoAgente,
    orbiProfit: result.gananciaOrbi,
  };
}
