import { DIRECT, PRICING_RULE, POR_SERVICIO, type MissionPriceResult } from "./config";

// Subconjunto de DIRECT que el motor usa en cada cálculo.
// Permite inyectar valores desde motor_params sin cambiar la fórmula.
export interface DirectParams {
  tarifaBase:     number;
  costoPorKm:     number;
  comisionAgente: number;
}

export function calcularMisionDirecta(
  distanceKm: number | null,
  serviceType?: string,
  params?: DirectParams,
): MissionPriceResult {
  const p = params ?? DIRECT;
  const safeDistance = distanceKm ?? 3;
  const multiplicador = serviceType != null ? (POR_SERVICIO[serviceType]?.multiplicador ?? 1.0) : 1.0;

  const servicioOrbi = Math.round((p.tarifaBase + safeDistance * p.costoPorKm) * multiplicador);
  const costoAgente = Math.round(servicioOrbi * p.comisionAgente);
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
