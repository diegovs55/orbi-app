/**
 * ORBI Motor Económico 1.0 — Única fuente de verdad para tarifas.
 *
 * Todos los valores numéricos del sistema de precios viven aquí.
 * Para cambiar una tarifa, modifica solo este archivo.
 */

export const PRICING_RULE = "ORBI_MOTOR_1.0";

// ── Misiones directas (Mandado, Mensajería, etc.) ────────────────────────────

export const DIRECT = {
  tarifaBase: 45,
  costoPorKm: 12,
  comisionAgente: 0.70,
  tarifaMinima: 45,
} as const;

// ── Misiones de catálogo (Compra local, Entrega, etc.) ───────────────────────

export const CATALOG = {
  radioMaximoKm: 30,
  comisionAgente: 0.70,   // 70% del service_fee va al agente; 30% a ORBI

  /** Tramos de tarifa base por distancia. Evaluar en orden ascendente. */
  tramos: [
    { hastaKm: 2,  tarifa: 25 },
    { hastaKm: 5,  tarifa: 35 },
    { hastaKm: 8,  tarifa: 45 },
    { hastaKm: 12, tarifa: 60 },
    { hastaKm: 20, tarifa: 80 },
  ] as ReadonlyArray<{ hastaKm: number; tarifa: number }>,

  /** Recargos por valor del pedido. Evaluar de mayor a menor subtotal. */
  recargos: [
    { desdeSubtotal: 600, cargo: 20 },
    { desdeSubtotal: 300, cargo: 10 },
  ] as ReadonlyArray<{ desdeSubtotal: number; cargo: number }>,
} as const;

// ── Por tipo de servicio — preparado para tarifas diferenciadas ──────────────
// Todos los multiplicadores en 1.0 hasta que se definan tarifas distintas.

export const POR_SERVICIO: Record<string, { multiplicador: number }> = {
  "Compra local":   { multiplicador: 1.0 },
  "Mandado":        { multiplicador: 1.0 },
  "Entrega":        { multiplicador: 1.0 },
  "Pago o trámite": { multiplicador: 1.0 },
  "Recolección":    { multiplicador: 1.0 },
  "Traslado":       { multiplicador: 1.0 },
};

// ── Separación precio cliente / costo operativo interno ─────────────────────

export interface MissionPriceResult {
  // Visible al cliente (CostBreakdown)
  subtotalProductos: number | null;
  servicioOrbi: number;
  totalCliente: number;

  // Interno — no se muestra en UI
  costoAgente: number;
  gananciaOrbi: number;
  pricingRule: string;

  // Segmentos futuros: preparados pero aún no afectan el precio
  distanciaAgente_negocio_km: number | null;
  distanciaNegocio_cliente_km: number | null;
}
