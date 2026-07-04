/**
 * GET /api/ledger/summary?from=ISO_DATE
 *
 * Resumen financiero de la plataforma para AdminNetworkEconomy.
 * Solo accesible server-side con SERVICE_ROLE_KEY.
 *
 * ── MÉTRICAS OPERATIVAS (disponibles hoy) ────────────────────────────────────
 *   facturacionCliente  — GMV: lo que pagaron los clientes (MISSION_PAYMENT)
 *   gananciaOrbi        — comisión de la plataforma (MISSION_COMMISSION)
 *   pagosAgentes        — total pagado a agentes (MISSION_EARNING, owner=agent)
 *   pagosNegocios       — total pagado a negocios (MISSION_EARNING, owner=business)
 *   takeRate            — gananciaOrbi / facturacionCliente × 100 (Take Rate %)
 *   numMovimientos      — total de entradas en el período
 *
 * ── MÉTRICAS DE INFRAESTRUCTURA (fase de pagos digitales) ────────────────────
 * Las siguientes métricas se activan cuando se integre Stripe, Mercado Pago,
 * CoDi u otro proveedor de pagos digitales. El ledger ya las soporta: solo
 * requieren entradas con estado='pending' en lugar de 'confirmed'.
 *
 *   fondosEnCustodia    — SUM(ABS(monto)) WHERE estado='pending' AND tipo='MISSION_PAYMENT'
 *                         Dinero ya capturado del cliente pero no liquidado al negocio/agente.
 *                         Hoy = $0 (MVP en efectivo, todo se confirma al instante).
 *
 *   pendientesDeLiquidar — SUM(monto) WHERE estado='pending' AND owner_type IN ('agent','business')
 *                          Ganancias de agentes y negocios en cola de liquidación (payout batch).
 *                          Se activa con integración de Stripe Connect / transferencias SPEI.
 *
 *   retirosPendientes   — SUM(monto) WHERE tipo='WITHDRAWAL' AND estado='pending'
 *                         Retiros solicitados pero no procesados (billetera digital ORBI).
 *                         Requiere feature de saldo acumulado por actor.
 *
 * Para activar cualquiera de estas métricas:
 *   1. Al cerrar misión, insertar entrada con estado='pending' en lugar de 'confirmed'.
 *   2. Al liquidar (webhook de Stripe/Mercado Pago), UPDATE estado='confirmed'.
 *   3. Agregar el campo al response de este endpoint y la tarjeta al dashboard.
 *   — Sin cambios estructurales al ledger ni al dashboard existente. —
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";


export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // ISO date string, optional

  // Construir query base
  let query = admin
    .from("ledger_entries")
    .select("owner_type, tipo, monto")
    .eq("estado", "confirmed");

  if (from) {
    query = query.gte("created_at", from);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[ledger/summary] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  // Acumular por tipo y owner_type
  let facturacionCliente = 0;
  let gananciaOrbi       = 0;
  let pagosAgentes       = 0;
  let pagosNegocios      = 0;

  for (const row of rows) {
    const monto = Number(row.monto) ?? 0;
    if (row.tipo === "MISSION_PAYMENT"    && row.owner_type === "customer") facturacionCliente += Math.abs(monto);
    if (row.tipo === "MISSION_COMMISSION" && row.owner_type === "orbi")     gananciaOrbi       += monto;
    if (row.tipo === "MISSION_EARNING"    && row.owner_type === "agent")    pagosAgentes       += monto;
    if (row.tipo === "MISSION_EARNING"    && row.owner_type === "business") pagosNegocios      += monto;
  }

  const facturacionFinal = Math.round(facturacionCliente * 100) / 100;
  const gananciaFinal    = Math.round(gananciaOrbi       * 100) / 100;
  const takeRate = facturacionFinal > 0
    ? Math.round((gananciaFinal / facturacionFinal) * 10000) / 100
    : null;

  return NextResponse.json({
    facturacionCliente: facturacionFinal,
    gananciaOrbi:       gananciaFinal,
    pagosAgentes:       Math.round(pagosAgentes  * 100) / 100,
    pagosNegocios:      Math.round(pagosNegocios * 100) / 100,
    takeRate,           // number (%) | null si no hay facturación en el período
    numMovimientos:     rows.length,
  });
}
