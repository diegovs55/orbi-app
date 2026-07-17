/**
 * POST /api/intention-logs
 *
 * Crea un registro de interpretación de intención.
 * Sin autenticación — el usuario puede no tener sesión al momento de buscar.
 * Solo escritura. No devuelve datos existentes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const textoOriginal     = typeof body.texto_original    === "string" ? body.texto_original.trim()    : "";
  const intencionOrbi     = typeof body.intencion_orbi    === "string" ? body.intencion_orbi.trim()    : "";
  const propuestaMostrada = typeof body.propuesta_mostrada === "string" ? body.propuesta_mostrada.trim() : "";
  const resultadosCatalogo = typeof body.resultados_catalogo === "number" ? Math.max(0, Math.floor(body.resultados_catalogo)) : 0;
  const correccionHumana  = typeof body.correccion_humana === "string" ? body.correccion_humana.trim() : null;
  const scope             = typeof body.scope === "string" ? body.scope.trim() : "zumpahuacan";

  if (!textoOriginal || !intencionOrbi || !propuestaMostrada) {
    return NextResponse.json(
      { error: "texto_original, intencion_orbi y propuesta_mostrada son requeridos." },
      { status: 400 },
    );
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }

  const { data, error } = await admin
    .from("intention_logs")
    .insert({
      texto_original:      textoOriginal,
      intencion_orbi:      intencionOrbi,
      propuesta_mostrada:  propuestaMostrada,
      resultados_catalogo: resultadosCatalogo,
      correccion_humana:   correccionHumana,
      scope,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
