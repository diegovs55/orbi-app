/**
 * GET /api/admin/intelligence/activity
 *
 * Indicadores económicos agregados de misiones cumplidas.
 * Solo lectura. Sin estimaciones. Toda agregación ocurre en servidor.
 *
 * Parámetros:
 *   period  — "hoy" | "7d" | "mes" | "anio" | "todo" | "custom"
 *   from    — ISO date string (requerido cuando period = "custom")
 *   to      — ISO date string (requerido cuando period = "custom")
 *
 * Zona horaria: America/Mexico_City para calcular límites de periodos.
 * La columna created_at está en UTC; el servidor convierte el límite
 * de "hoy" / "este mes" etc. al equivalente UTC antes de filtrar.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";

export type ActivityPeriod = "hoy" | "7d" | "mes" | "anio" | "todo" | "custom";

export type ActivitySummary = {
  period: ActivityPeriod;
  fromISO: string | null;
  toISO: string | null;
  // Misiones
  misionesCumplidas: number;
  // Facturación (total_amount)
  facturacionTotal: number;
  ticketPromedio: number | null;
  // Distribución económica
  comisionOrbi: number;
  pagoAgentes: number;
  // Negocios — cobertura parcial
  ingresoNegocios: number | null;
  misionesConSubtotal: number; // cuántas de las cumplidas tienen subtotal_productos
  // Tipos de servicio representados
  tiposServicio: Array<{ tipo: string; count: number; facturacion: number }>;
  // Negocios con actividad (compra_negocio missions)
  negociosActivos: Array<{
    businessId: string;
    businessName: string;
    misiones: number;
    facturacion: number;
    ticketPromedio: number;
    comisionOrbi: number;
    pagoAgente: number;
    ingresoNegocio: number | null;
  }>;
};

const TZ = "America/Mexico_City";

/** Devuelve el inicio del día actual en Mexico_City como Date UTC */
function hoyInicio(): Date {
  const now = new Date();
  // Construir "hoy 00:00:00" en zona Mexico_City
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  // Midnight Mexico_City expressed as UTC
  return new Date(`${y}-${m}-${d}T06:00:00.000Z`); // CST = UTC-6; adjust for DST if needed
}

/** Inicio del mes actual en Mexico_City */
function mesInicio(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return new Date(`${y}-${m}-01T06:00:00.000Z`);
}

/** Inicio del año actual en Mexico_City */
function anioInicio(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  return new Date(`${y}-01-01T06:00:00.000Z`);
}

function periodBounds(
  period: ActivityPeriod,
  from: string | null,
  to: string | null,
): { fromDate: Date | null; toDate: Date | null } {
  if (period === "todo") return { fromDate: null, toDate: null };
  if (period === "hoy") return { fromDate: hoyInicio(), toDate: null };
  if (period === "7d") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return { fromDate: d, toDate: null };
  }
  if (period === "mes") return { fromDate: mesInicio(), toDate: null };
  if (period === "anio") return { fromDate: anioInicio(), toDate: null };
  if (period === "custom" && from) {
    const fromDate = new Date(`${from}T06:00:00.000Z`);
    const toDate = to ? new Date(`${to}T06:00:00.000Z`) : null;
    return { fromDate, toDate };
  }
  return { fromDate: null, toDate: null };
}

type MissionRow = {
  id: string;
  status: string;
  total_amount: number | null;
  service_fee: number | null;
  costo_agente: number | null;
  ganancia_orbi: number | null;
  subtotal_productos: number | null;
  service_type: string | null;
  mission_type: string | null;
  business_id: string | null;
  business_name: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const auth = await assertAdminJWT(req);
  if (auth instanceof NextResponse) return auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfiguration." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const rawPeriod = searchParams.get("period") ?? "todo";
  const period: ActivityPeriod = [
    "hoy", "7d", "mes", "anio", "todo", "custom",
  ].includes(rawPeriod) ? (rawPeriod as ActivityPeriod) : "todo";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const { fromDate, toDate } = periodBounds(period, from, to);

  // Build query — only cumplida missions
  let query = admin
    .from("missions")
    .select(
      "id,status,total_amount,service_fee,costo_agente,ganancia_orbi,subtotal_productos,service_type,mission_type,business_id,business_name,created_at",
    )
    .eq("status", "cumplida");

  if (fromDate) query = query.gte("created_at", fromDate.toISOString());
  if (toDate) query = query.lt("created_at", toDate.toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as MissionRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      period,
      fromISO: fromDate?.toISOString() ?? null,
      toISO: toDate?.toISOString() ?? null,
      misionesCumplidas: 0,
      facturacionTotal: 0,
      ticketPromedio: null,
      comisionOrbi: 0,
      pagoAgentes: 0,
      ingresoNegocios: null,
      misionesConSubtotal: 0,
      tiposServicio: [],
      negociosActivos: [],
    } satisfies ActivitySummary);
  }

  // Aggregate metrics
  let facturacion = 0;
  let comision = 0;
  let pagos = 0;
  let ingreso = 0;
  let misionesConSub = 0;

  const servicioMap = new Map<string, { count: number; facturacion: number }>();
  const negocioMap = new Map<string, {
    businessName: string;
    misiones: number;
    facturacion: number;
    comisionOrbi: number;
    pagoAgente: number;
    ingresoNegocio: number;
  }>();

  for (const r of rows) {
    const ta = r.total_amount ?? 0;
    const go = r.ganancia_orbi ?? 0;
    const ca = r.costo_agente ?? 0;

    facturacion += ta;
    comision += go;
    pagos += ca;

    if (r.subtotal_productos != null) {
      ingreso += r.subtotal_productos;
      misionesConSub++;
    }

    // Service type aggregation
    const tipo = r.service_type?.trim() ?? "Sin tipo";
    const sEntry = servicioMap.get(tipo) ?? { count: 0, facturacion: 0 };
    sEntry.count++;
    sEntry.facturacion += ta;
    servicioMap.set(tipo, sEntry);

    // Business aggregation (only when business_id exists)
    if (r.business_id && r.business_name) {
      const bEntry = negocioMap.get(r.business_id) ?? {
        businessName: r.business_name,
        misiones: 0,
        facturacion: 0,
        comisionOrbi: 0,
        pagoAgente: 0,
        ingresoNegocio: 0,
      };
      bEntry.misiones++;
      bEntry.facturacion += ta;
      bEntry.comisionOrbi += go;
      bEntry.pagoAgente += ca;
      if (r.subtotal_productos != null) bEntry.ingresoNegocio += r.subtotal_productos;
      negocioMap.set(r.business_id, bEntry);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const tiposServicio = Array.from(servicioMap.entries())
    .map(([tipo, v]) => ({ tipo, count: v.count, facturacion: round2(v.facturacion) }))
    .sort((a, b) => b.count - a.count);

  const negociosActivos = Array.from(negocioMap.entries())
    .map(([businessId, v]) => ({
      businessId,
      businessName: v.businessName,
      misiones: v.misiones,
      facturacion: round2(v.facturacion),
      ticketPromedio: round2(v.facturacion / v.misiones),
      comisionOrbi: round2(v.comisionOrbi),
      pagoAgente: round2(v.pagoAgente),
      ingresoNegocio: v.ingresoNegocio > 0 ? round2(v.ingresoNegocio) : null,
    }))
    .sort((a, b) => b.facturacion - a.facturacion);

  return NextResponse.json({
    period,
    fromISO: fromDate?.toISOString() ?? null,
    toISO: toDate?.toISOString() ?? null,
    misionesCumplidas: rows.length,
    facturacionTotal: round2(facturacion),
    ticketPromedio: rows.length > 0 ? round2(facturacion / rows.length) : null,
    comisionOrbi: round2(comision),
    pagoAgentes: round2(pagos),
    ingresoNegocios: misionesConSub > 0 ? round2(ingreso) : null,
    misionesConSubtotal: misionesConSub,
    tiposServicio,
    negociosActivos,
  } satisfies ActivitySummary);
}
