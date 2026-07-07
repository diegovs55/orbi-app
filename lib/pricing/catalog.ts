import { CATALOG, PRICING_RULE, POR_SERVICIO, type MissionPriceResult } from "./config";

/**
 * Calcula el fee de logística para una misión de catálogo.
 * Misma lógica que la anterior `calculateServiceFee()` en ServiceRequestFlow.
 * Retorna null si la distancia está fuera de cobertura.
 */
export function calculateServiceFee(
  distance: number | null,
  subtotal: number,
  serviceType?: string
): number | null {
  if (distance === null || !Number.isFinite(distance) || distance < 0 || distance > CATALOG.radioMaximoKm) {
    return null;
  }

  const multiplicador = serviceType != null ? (POR_SERVICIO[serviceType]?.multiplicador ?? 1.0) : 1.0;

  const tramo = CATALOG.tramos.find((t) => distance <= t.hastaKm);
  let fee = tramo ? tramo.tarifa : CATALOG.tramos[CATALOG.tramos.length - 1].tarifa;

  const recargo = CATALOG.recargos.find((r) => subtotal > r.desdeSubtotal);
  if (recargo) fee += recargo.cargo;

  return Math.round(fee * multiplicador);
}

/**
 * Calcula el precio completo de una misión de catálogo.
 * Retorna null en servicioOrbi si la distancia está fuera de cobertura.
 */
export function calcularMisionCatalogo(
  distanceKm: number | null,
  subtotalProductos: number,
  serviceType?: string
): MissionPriceResult & { servicioOrbi: number; outOfRange: boolean } {
  const fee = calculateServiceFee(distanceKm, subtotalProductos, serviceType);
  const servicioOrbi = fee ?? 0;
  const totalCliente = subtotalProductos + servicioOrbi;

  const costoAgente  = Math.round(servicioOrbi * CATALOG.comisionAgente * 100) / 100;
  const gananciaOrbi = Math.round((servicioOrbi - costoAgente) * 100) / 100;

  return {
    subtotalProductos,
    servicioOrbi,
    totalCliente,
    costoAgente,
    gananciaOrbi,
    pricingRule: PRICING_RULE,
    distanciaAgente_negocio_km: null,
    distanciaNegocio_cliente_km: distanceKm,
    outOfRange: fee === null,
  };
}
