/**
 * GET /api/config/motor-params
 *
 * Expone los dos radios operativos vigentes para el scope "zumpahuacan".
 * Usado por componentes cliente que necesitan los límites del motor
 * sin importar código server-only (lib/pricing/server.ts).
 *
 * - Solo lectura. Sin autenticación — los valores no son sensibles.
 * - Cache-Control: no-store — las reglas operativas no deben servirse obsoletas.
 * - No expone otros parámetros del motor.
 * - El scope es fijo e interno; no acepta parámetros del cliente.
 */

import { NextResponse } from "next/server";
import { loadMotorParams } from "@/lib/pricing/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { params } = await loadMotorParams("zumpahuacan");
    return NextResponse.json(
      {
        radioAsignacionAutomaticaKm: params.radioAsignacionAutomaticaKm,
        radioAsignacionMaximaKm:     params.radioAsignacionMaximaKm,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los parámetros operativos." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
