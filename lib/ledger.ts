/**
 * ORBI Cuenta ORBI — Motor de Ledger
 *
 * Módulo puro: no escribe a Supabase ni tiene efectos secundarios.
 * Recibe una misión completada y devuelve los movimientos contables
 * que deben insertarse en public.ledger_entries.
 *
 * Reglas invariantes:
 *   SUM(monto de todas las entradas de una misión) = 0
 *   El dinero que sale del cliente entra exactamente a los demás actores.
 */

import type { ActiveMission } from "./missions";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type LedgerOwnerType = "customer" | "business" | "agent" | "orbi";

export type LedgerEntryType =
  // Ciclo de vida de misión (hoy)
  | "MISSION_PAYMENT"      // cliente paga al cierre
  | "MISSION_EARNING"      // negocio o agente reciben al cierre
  | "MISSION_COMMISSION"   // orbi recibe comisión al cierre
  // Ciclo de vida de misión (futuro)
  | "MISSION_CREATED"      // reserva de saldo al crear (prepago)
  | "MISSION_ACCEPTED"     // confirmación de reserva al aceptar
  | "MISSION_ASSIGNED"     // fondos en tránsito al asignar agente
  | "MISSION_SETTLED"      // liquidación confirmada
  // Ajustes financieros (futuro)
  | "REFUND"               // devolución al cliente
  | "BONUS"                // bono al agente
  | "PENALTY"              // penalización
  | "ADJUSTMENT"           // ajuste manual por admin
  // Movimientos de cuenta (futuro)
  | "WITHDRAWAL"           // retiro de saldo
  | "DEPOSIT"              // depósito / recarga
  | "PROMOTION"            // crédito promocional
  | "CASHBACK";            // cashback por lealtad

export type LedgerEntryEstado = "confirmed" | "pending" | "reversed";

/** Representa una fila lista para insertar en public.ledger_entries. */
export interface LedgerEntry {
  owner_type:     LedgerOwnerType;
  owner_id:       string;
  tipo:           LedgerEntryType;
  monto:          number;           // positivo = ingreso, negativo = egreso
  concepto:       string;
  mission_id:     string;
  pricing_rule:   string | null;
  estado:         LedgerEntryEstado;
  currency:       string;           // ISO 4217 — siempre 'MXN' en el MVP
  saldo_anterior: number;           // 0 hasta que se implemente el cálculo en cadena
  saldo_nuevo:    number;           // 0 hasta que se implemente el cálculo en cadena
  metadata:       Record<string, unknown>;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Redondea a 2 decimales evitando errores de punto flotante. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveCustomerOwnerId(mission: ActiveMission): string {
  // user_id (Supabase Auth UUID) es la única identidad válida del cliente.
  return mission.user_id ?? "";
}

// ── Validador de IDs críticos ────────────────────────────────────────────────

/**
 * Verifica que la misión tiene todos los IDs financieros requeridos
 * antes de generar entradas de ledger.
 *
 * Lanza un error descriptivo si falta cualquier ID crítico, evitando
 * que owner_id = "unknown" llegue a public.ledger_entries.
 */
export function validateMissionIds(mission: ActiveMission): void {
  const isCatalog = mission.mission_type === "compra_negocio";

  // El cliente debe tener user_id — única identidad válida.
  const customerId = resolveCustomerOwnerId(mission);
  if (!customerId || customerId.trim() === "") {
    throw new Error(
      `[ledger] owner_id del cliente es inválido en misión ${mission.id}. ` +
      `Requiere user_id.`
    );
  }

  // El agente es requerido en toda misión que llega al ledger
  if (!mission.selected_agent_id || mission.selected_agent_id.trim() === "") {
    throw new Error(
      `[ledger] selected_agent_id faltante en misión ${mission.id}. ` +
      `No se puede generar ledger sin agente asignado.`
    );
  }

  // El negocio es requerido solo en misiones de catálogo
  if (isCatalog && (!mission.business_id || mission.business_id.trim() === "")) {
    throw new Error(
      `[ledger] business_id faltante en misión de catálogo ${mission.id}. ` +
      `Las misiones compra_negocio requieren business_id para liquidar al negocio.`
    );
  }
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Genera los movimientos contables correspondientes a una misión completada.
 *
 * Para misiones de catálogo (compra_negocio):
 *   - Cliente paga: -(subtotal_productos + service_fee)
 *   - Negocio recibe: +subtotal_productos
 *   - Agente recibe: +costo_agente  (70% del service_fee)
 *   - ORBI recibe:   +ganancia_orbi (30% del service_fee)
 *
 * Para misiones directas:
 *   - Cliente paga: -total_amount
 *   - Agente recibe: +costo_agente  (70% del total)
 *   - ORBI recibe:   +ganancia_orbi (30% del total)
 *
 * Invariante: SUM(monto) = 0 en todos los casos.
 */
export function generarMovimientosMision(mission: ActiveMission): LedgerEntry[] {
  // Lanza si faltan IDs críticos — nunca debe producir owner_id vacío o "unknown"
  validateMissionIds(mission);

  const missionId    = mission.id;
  const pricingRule  = mission.pricing_rule ?? null;
  const isCatalog    = mission.mission_type === "compra_negocio";

  const totalCliente      = r2(mission.total_amount        ?? 0);
  const subtotalProductos = r2(mission.subtotal_productos  ?? 0);
  const costoAgente       = r2(mission.costo_agente        ?? 0);
  const gananciaOrbi      = r2(mission.ganancia_orbi       ?? 0);

  const customerId  = resolveCustomerOwnerId(mission);
  const agentId     = mission.selected_agent_id!;   // validado arriba
  const businessId  = mission.business_id!;          // validado arriba para catálogo

  const base: Omit<LedgerEntry, "owner_type" | "owner_id" | "tipo" | "monto" | "concepto"> = {
    mission_id:     missionId,
    pricing_rule:   pricingRule,
    estado:         "confirmed",
    currency:       "MXN",
    saldo_anterior: 0,
    saldo_nuevo:    0,
    metadata:       {},
  };

  if (isCatalog) {
    // ── Misión de catálogo ─────────────────────────────────────────────────
    // Cliente paga el total completo (productos + logística)
    // Negocio recibe el valor de los productos
    // Agente y ORBI se reparten el fee de logística (70/30)

    const entries: LedgerEntry[] = [
      {
        ...base,
        owner_type: "customer",
        owner_id:   customerId,
        tipo:       "MISSION_PAYMENT",
        monto:      r2(-totalCliente),
        concepto:   `Pago misión #${missionId.slice(0, 8)} — ${mission.business_name ?? "negocio"}`,
      },
      {
        ...base,
        owner_type: "business",
        owner_id:   businessId,
        tipo:       "MISSION_EARNING",
        monto:      r2(subtotalProductos),
        concepto:   `Venta misión #${missionId.slice(0, 8)} — ${mission.service_type}`,
      },
      {
        ...base,
        owner_type: "agent",
        owner_id:   agentId,
        tipo:       "MISSION_EARNING",
        monto:      r2(costoAgente),
        concepto:   `Comisión agente misión #${missionId.slice(0, 8)}`,
      },
      {
        ...base,
        owner_type: "orbi",
        owner_id:   "system",
        tipo:       "MISSION_COMMISSION",
        monto:      r2(gananciaOrbi),
        concepto:   `Comisión plataforma misión #${missionId.slice(0, 8)}`,
      },
    ];

    return entries;
  }

  // ── Misión directa (Mandado, Mensajería, etc.) ───────────────────────────
  // No hay negocio involucrado — el fee completo se reparte entre agente y ORBI

  return [
    {
      ...base,
      owner_type: "customer",
      owner_id:   customerId,
      tipo:       "MISSION_PAYMENT",
      monto:      r2(-totalCliente),
      concepto:   `Pago misión #${missionId.slice(0, 8)} — ${mission.service_type}`,
    },
    {
      ...base,
      owner_type: "agent",
      owner_id:   agentId,
      tipo:       "MISSION_EARNING",
      monto:      r2(costoAgente),
      concepto:   `Comisión agente misión #${missionId.slice(0, 8)}`,
    },
    {
      ...base,
      owner_type: "orbi",
      owner_id:   "system",
      tipo:       "MISSION_COMMISSION",
      monto:      r2(gananciaOrbi),
      concepto:   `Comisión plataforma misión #${missionId.slice(0, 8)}`,
    },
  ];
}

// ── Validador de invariante (solo para tests) ────────────────────────────────

/**
 * Verifica que la suma de todos los montos sea 0 (balance perfecto).
 * Lanza un error si la invariante se viola — útil en CI/tests.
 */
export function assertLedgerBalance(entries: LedgerEntry[]): void {
  const sum = r2(entries.reduce((acc, e) => acc + e.monto, 0));
  if (Math.abs(sum) > 0.01) {
    throw new Error(
      `[ledger] Invariante violada: SUM(monto) = ${sum} (debe ser 0). ` +
      `Entradas: ${JSON.stringify(entries.map((e) => ({ tipo: e.tipo, monto: e.monto })))}`
    );
  }
}
