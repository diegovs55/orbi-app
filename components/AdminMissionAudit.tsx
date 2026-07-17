"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

type AuditData = {
  id: string;
  service_type: string;
  mission_type: string | null;
  status: string;
  created_at: string;
  distance_km: number | null;
  total_amount: number | null;
  subtotal_productos: number | null;
  service_fee: number | null;
  costo_agente: number | null;
  ganancia_orbi: number | null;
  pricing_rule: string | null;
  motor_params_version: number | null;
  invariant_ok: boolean | null;
  inv_p1_ok: boolean | null;
};

function mxn(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Row({ label, value, mono = false, highlight = false }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 border-b border-white/[0.04] last:border-0 ${highlight ? "text-orbi-text" : "text-orbi-muted"}`}>
      <span className="text-[11px] uppercase tracking-[0.08em] shrink-0">{label}</span>
      <span className={`text-[13px] font-semibold text-right ${mono ? "font-mono" : ""} ${highlight ? "text-orbi-text" : "text-orbi-muted"}`}>
        {value}
      </span>
    </div>
  );
}

export function AdminMissionAudit({ missionId }: { missionId: string }) {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    adminFetch(`/api/admin/missions/${missionId}/audit`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Error al cargar auditoría.");
        } else {
          setData(json as AuditData);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Error de red al cargar auditoría.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [missionId]);

  if (loading) {
    return (
      <div className="px-4 py-3 text-[11px] text-orbi-muted animate-pulse">
        Cargando auditoría…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 text-[11px] text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const hasEconomicData =
    data.service_fee != null ||
    data.costo_agente != null ||
    data.ganancia_orbi != null;

  return (
    <div className="bg-white/[0.025] border border-white/[0.07] rounded-lg mx-2 my-1 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-orbi-muted/60 font-bold mb-3">
        Auditoría Económica
      </p>

      {!hasEconomicData ? (
        <p className="text-[12px] text-orbi-muted/60 italic">
          Esta misión no tiene datos económicos registrados (fue creada antes del motor de precios o está pendiente).
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 sm:gap-x-8">
          {/* Columna izquierda — distribución del dinero */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-orbi-muted/50 mb-1">
              Distribución
            </p>
            <Row label="Total cliente"    value={mxn(data.total_amount)}   highlight />
            <Row label="Servicio ORBI"    value={mxn(data.service_fee)} />
            {data.subtotal_productos != null && (
              <Row label="Productos"      value={mxn(data.subtotal_productos)} />
            )}
            <Row label="Pago al agente"   value={mxn(data.costo_agente)} />
            <Row label="Ganancia ORBI"    value={mxn(data.ganancia_orbi)} />
          </div>

          {/* Columna derecha — trazabilidad */}
          <div className="mt-3 sm:mt-0">
            <p className="text-[10px] uppercase tracking-[0.08em] text-orbi-muted/50 mb-1">
              Trazabilidad
            </p>
            <Row label="Fórmula"          value={data.pricing_rule ?? "—"} mono />
            <Row label="Versión params"   value={data.motor_params_version != null ? `#${data.motor_params_version}` : "—"} mono />
            <Row label="Distancia"        value={data.distance_km != null ? `${data.distance_km.toFixed(2)} km` : "—"} />
            <Row label="Tipo de misión"   value={data.mission_type ?? "—"} />

            {/* Verificaciones */}
            <div className="mt-2 flex flex-wrap gap-2">
              {data.invariant_ok != null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${data.invariant_ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                  {data.invariant_ok ? "✓ Total cuadra" : "✗ Total no cuadra"}
                </span>
              )}
              {data.inv_p1_ok != null && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${data.inv_p1_ok ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
                  {data.inv_p1_ok ? "✓ INV-P1" : "✗ INV-P1 violado"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
