/**
 * GET /api/admin/intelligence/activity/search
 *
 * Búsqueda económica sobre misiones cumplidas.
 * Solo lectura. Resultados agrupados por negocio o tipo de servicio.
 *
 * Parámetros:
 *   q       — término de búsqueda (requerido)
 *   period  — mismo contrato que /activity
 *   from    — ISO date (custom)
 *   to      — ISO date (custom)
 *   limit   — máx por página (default 50)
 *   offset  — desplazamiento (default 0)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin, assertAdminJWT } from "@/lib/supabase-admin";
import type { ActivityPeriod } from "@/app/api/admin/intelligence/activity/route";

export type ActivitySearchGroup = {
  // Tipo de agrupación
  kind: "negocio" | "servicio";
  // Negocio (cuando kind = "negocio")
  businessId: string | null;
  businessName: string | null;
  // Tipo de servicio (siempre presente)
  serviceType: string;
  // Métricas del grupo
  misiones: number;
  facturacion: number;
  ticketPromedio: number | null;
  comisionOrbi: number;
  pagoAgente: number;
  // Cobertura parcial
  ingresoNegocio: number | null;
  misionesConSubtotal: number;
  // Muestra de misiones (máx 5 para contexto, sin datos personales)
  sample: Array<{
    id: string;
    productName: string | null;
    serviceType: string;
    totalAmount: number;
    createdAt: string;
  }>;
  // Aviso de cobertura cuando aplique
  cobertura: string | null;
};

export type ActivitySearchResponse = {
  query: string;
  total: number;
  groups: ActivitySearchGroup[];
};

// Reutiliza la misma lógica de periodo (copiada aquí para no importar desde route.ts
// que exporta también el handler GET, evitando cargas innecesarias)
const TZ = "America/Mexico_City";

function hoyInicio(): Date {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = f.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}T06:00:00.000Z`);
}
function mesInicio(): Date {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = f.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return new Date(`${y}-${m}-01T06:00:00.000Z`);
}
function anioInicio(): Date {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = f.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  return new Date(`${y}-01-01T06:00:00.000Z`);
}

function periodBounds(period: ActivityPeriod, from: string | null, to: string | null) {
  if (period === "todo") return { fromDate: null, toDate: null };
  if (period === "hoy") return { fromDate: hoyInicio(), toDate: null };
  if (period === "7d") { const d = new Date(); d.setUTCDate(d.getUTCDate() - 7); return { fromDate: d, toDate: null }; }
  if (period === "mes") return { fromDate: mesInicio(), toDate: null };
  if (period === "anio") return { fromDate: anioInicio(), toDate: null };
  if (period === "custom" && from) {
    return { fromDate: new Date(`${from}T06:00:00.000Z`), toDate: to ? new Date(`${to}T06:00:00.000Z`) : null };
  }
  return { fromDate: null, toDate: null };
}

type MRow = {
  id: string;
  total_amount: number | null;
  service_fee: number | null;
  costo_agente: number | null;
  ganancia_orbi: number | null;
  subtotal_productos: number | null;
  service_type: string | null;
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
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);
  const rawPeriod = searchParams.get("period") ?? "todo";
  const period: ActivityPeriod = ["hoy","7d","mes","anio","todo","custom"].includes(rawPeriod)
    ? (rawPeriod as ActivityPeriod) : "todo";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!q) {
    return NextResponse.json({ query: "", total: 0, groups: [] } satisfies ActivitySearchResponse);
  }

  const { fromDate, toDate } = periodBounds(period, from, to);
  const term = `%${q}%`;

  // Search only cumplida missions matching the query across available text fields.
  // items->>'category' is JSONB — Supabase REST doesn't support JSONB ilike natively,
  // so we fetch all cumplida rows in the period and filter category in-memory.
  let baseQ = admin
    .from("missions")
    .select(
      "id,total_amount,service_fee,costo_agente,ganancia_orbi,subtotal_productos,service_type,business_id,business_name,created_at",
    )
    .eq("status", "cumplida")
    .or(`business_name.ilike.${term},service_type.ilike.${term}`);

  if (fromDate) baseQ = baseQ.gte("created_at", fromDate.toISOString());
  if (toDate) baseQ = baseQ.lt("created_at", toDate.toISOString());

  const { data, error } = await baseQ;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as MRow[];

  if (rows.length === 0) {
    return NextResponse.json({ query: q, total: 0, groups: [] } satisfies ActivitySearchResponse);
  }

  // Group by business_id (when available) or service_type
  const negocioMap = new Map<string, {
    businessId: string;
    businessName: string;
    serviceType: string;
    rows: MRow[];
  }>();
  const servicioMap = new Map<string, { serviceType: string; rows: MRow[] }>();

  for (const r of rows) {
    if (r.business_id && r.business_name) {
      const key = r.business_id;
      const entry = negocioMap.get(key) ?? {
        businessId: r.business_id,
        businessName: r.business_name,
        serviceType: r.service_type ?? "Sin tipo",
        rows: [],
      };
      entry.rows.push(r);
      negocioMap.set(key, entry);
    } else {
      const tipo = r.service_type?.trim() ?? "Sin tipo";
      const entry = servicioMap.get(tipo) ?? { serviceType: tipo, rows: [] };
      entry.rows.push(r);
      servicioMap.set(tipo, entry);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  function buildGroup(
    kind: "negocio" | "servicio",
    businessId: string | null,
    businessName: string | null,
    serviceType: string,
    groupRows: MRow[],
  ): ActivitySearchGroup {
    let facturacion = 0, comision = 0, pagos = 0, ingreso = 0, conSub = 0;
    for (const r of groupRows) {
      facturacion += r.total_amount ?? 0;
      comision += r.ganancia_orbi ?? 0;
      pagos += r.costo_agente ?? 0;
      if (r.subtotal_productos != null) { ingreso += r.subtotal_productos; conSub++; }
    }
    const sample = groupRows.slice(0, 5).map((r) => ({
      id: r.id,
      productName: null, // product_name no existe como columna en public.missions
      serviceType: r.service_type ?? "",
      totalAmount: r.total_amount ?? 0,
      createdAt: r.created_at,
    }));

    let cobertura: string | null = null;
    if (kind === "negocio" && conSub < groupRows.length) {
      cobertura = `Ingreso de negocio disponible en ${conSub} de ${groupRows.length} misiones con subtotal registrado.`;
    }

    return {
      kind,
      businessId,
      businessName,
      serviceType,
      misiones: groupRows.length,
      facturacion: round2(facturacion),
      ticketPromedio: groupRows.length > 0 ? round2(facturacion / groupRows.length) : null,
      comisionOrbi: round2(comision),
      pagoAgente: round2(pagos),
      ingresoNegocio: conSub > 0 ? round2(ingreso) : null,
      misionesConSubtotal: conSub,
      sample,
      cobertura,
    };
  }

  const groups: ActivitySearchGroup[] = [
    ...Array.from(negocioMap.values()).map((g) =>
      buildGroup("negocio", g.businessId, g.businessName, g.serviceType, g.rows),
    ),
    ...Array.from(servicioMap.values()).map((g) =>
      buildGroup("servicio", null, null, g.serviceType, g.rows),
    ),
  ].sort((a, b) => b.facturacion - a.facturacion);

  const total = groups.length;
  const page = groups.slice(offset, offset + limit);

  return NextResponse.json({ query: q, total, groups: page } satisfies ActivitySearchResponse);
}
