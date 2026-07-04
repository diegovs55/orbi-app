/**
 * ORBI — Event Log
 *
 * Helper para registrar eventos operativos en public.event_log.
 *
 * Principio de aislamiento:
 *   logEvent() NUNCA lanza. Si el INSERT falla (red, RLS, Supabase caído),
 *   el error se escribe en console.error y se ignora.
 *   La operación principal no se bloquea ni se afecta bajo ninguna circunstancia.
 *
 * Uso:
 *   await logEvent({ event_type: "mission.created", severity: "info", ... })
 *
 * Se usa `await` en lugar de `void` para garantizar que el INSERT se complete
 * incluso en entornos serverless donde los background promises pueden truncarse.
 * El overhead es un único INSERT a Supabase (<50 ms).
 */

import { getAdmin } from "@/lib/supabase-admin";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EventSeverity = "info" | "warn" | "error" | "critical";
export type EventSource   = "api_route" | "client" | "system" | "supabase";
export type EntityType    = "mission" | "agent" | "business" | "ledger" | "alert";
export type ActorType     = "agent" | "customer" | "business" | "system";

export interface LogEventParams {
  event_type:    string;         // mission.created, ledger.pending, api.complete.error_500, …
  severity:      EventSeverity;
  source:        EventSource;
  entity_type?:  EntityType;
  entity_id?:    string;         // UUID de la misión, agente, negocio, etc.
  actor_type?:   ActorType;
  actor_id?:     string;
  payload?:      Record<string, unknown>;
  error_detail?: string;
  request_id?:   string;        // correlación entre eventos del mismo request HTTP
  http_status?:  number;
  duration_ms?:  number;
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    const admin = getAdmin();
    if (!admin) {
      console.error("[event-log] No se pudo inicializar el cliente admin.");
      return;
    }

    // Cast to unknown: the Supabase generated types won't include event_log
    // until the table is created in the database. The cast is safe because
    // the schema is controlled entirely by us.
    const row: Record<string, unknown> = {
      event_type:   params.event_type,
      severity:     params.severity,
      source:       params.source,
      entity_type:  params.entity_type  ?? null,
      entity_id:    params.entity_id    ?? null,
      actor_type:   params.actor_type   ?? null,
      actor_id:     params.actor_id     ?? null,
      payload:      params.payload      ?? {},
      error_detail: params.error_detail ?? null,
      request_id:   params.request_id   ?? null,
      http_status:  params.http_status  ?? null,
      duration_ms:  params.duration_ms  ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from("event_log") as any).insert(row);

    if (error) {
      // Solo console.error — nunca relanzar.
      console.error("[event-log] INSERT failed:", error.message, "| event:", params.event_type);
    }
  } catch (err) {
    // Captura cualquier error inesperado (red, timeout, etc.).
    // La operación principal no se ve afectada bajo ninguna circunstancia.
    console.error("[event-log] Error inesperado:", err, "| event:", params.event_type);
  }
}
