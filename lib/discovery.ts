/**
 * Configuración territorial — G2
 *
 * Separado del motor económico (lib/pricing/). No afecta tarifas ni pagos.
 *
 * Los radios son PROVISIONALES y deben validarse operativamente antes de
 * fijarlos como permanentes. Están mapeados contra los valores reales de
 * BusinessSector (lib/catalog.ts:businessSectors), no contra etiquetas
 * conceptuales del diseño.
 *
 * BusinessSector real: "Alimentos y bebidas" | "Farmacia" | "Papelería" |
 *   "Ferretería" | "Tecnología" | "Servicios" | "Mandados" | "Transporte" | "Otro"
 */

// Sin importación de lib/catalog para evitar dependencia circular.
// Valores mapeados contra BusinessSector real (lib/catalog.ts:businessSectors):
//   "Alimentos y bebidas" | "Farmacia" | "Papelería" | "Ferretería" |
//   "Tecnología" | "Servicios" | "Mandados" | "Transporte" | "Otro"

/**
 * Radios territoriales por sector de negocio.
 * radioAmpliadoMvp: usado únicamente en Bloque 4 (ampliación explícita).
 */
export const DISCOVERY = {
  // Todos los radios son PROVISIONALES — sujetos a validación operativa antes de fijarlos.
  // Tecnología = 15 km provisional; puede ajustarse cuando haya datos reales de cobertura.
  radioOrdinarioPorSector: {
    "Alimentos y bebidas": 8,   // provisional — cafeterías, restaurantes, sodas
    "Farmacia":            15,  // provisional — farmacias y parafarmacias
    "Papelería":           10,  // provisional
    "Ferretería":          10,  // provisional
    "Tecnología":          15,  // provisional
    "Servicios":           20,  // provisional — servicios especializados
    "Mandados":            12,  // provisional — equivalente a "Mercado y abarrotes" del diseño
    "Transporte":          30,  // provisional — equivalente a "Paquetería y mensajería" del diseño
    "Otro":                10,  // provisional — fallback de sector
  } as Record<string, number>,

  radioOrdinarioFallback: 10,  // usado si sector no está en la tabla (cadena arbitraria)
  radioAmpliadoMvp: 30,        // Bloque 4 — no usar aquí
} as const;

/**
 * Devuelve el radio ordinario en km para un sector de negocio dado.
 * Si el sector no pertenece a BusinessSector (cadena custom), aplica fallback.
 */
export function getOrdinaryRadiusKm(sector: string): number {
  const table = DISCOVERY.radioOrdinarioPorSector as Record<string, number>;
  return table[sector] ?? DISCOVERY.radioOrdinarioFallback;
}

/**
 * Haversine client-side (puro, sin deps de servidor).
 * Devuelve la distancia en línea recta en km entre dos coordenadas geográficas.
 *
 * Uso en G2 MVP: prefiltro de descubrimiento y ordenamiento únicamente.
 * No equivale a distancia vial ni tiempo de traslado.
 * Ver DEU-G2-ROAD-DISTANCE para la evolución planificada.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
