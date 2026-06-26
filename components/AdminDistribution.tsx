"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActiveMission, fetchMissionsForDistribution } from "@/lib/missions";
import { subscribeToTableChanges } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

type DistributionFilter =
  | "Hoy"
  | "Últimos 7 días"
  | "Este mes"
  | "Este año"
  | "Todo el tiempo";

const DISTRIBUTION_FILTERS: DistributionFilter[] = [
  "Hoy",
  "Últimos 7 días",
  "Este mes",
  "Este año",
  "Todo el tiempo",
];

const SERVICE_LABELS = [
  "Mandado",
  "Entrega",
  "Traslado",
  "Compra local",
  "Pago o trámite",
];

const PAYMENT_LABELS = ["Efectivo", "Transferencia", "Tarjeta"];

function readAdminSession() {
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function subscribeToAdminSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("orbi-admin-session-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("orbi-admin-session-change", callback);
  };
}

function getFilterStart(filter: DistributionFilter): Date | null {
  const now = new Date();
  if (filter === "Todo el tiempo") return null;
  if (filter === "Hoy")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "Últimos 7 días") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (filter === "Este mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (filter === "Este año") return new Date(now.getFullYear(), 0, 1);
  return null;
}

type Bar = { label: string; count: number; pct: number };

/** Builds bars with percentage calculated only over missions with a valid value. */
function buildBars(
  missions: ActiveMission[],
  labels: string[],
  getValue: (m: ActiveMission) => string | undefined
): Bar[] {
  const validMissions = missions.filter((m) => {
    const v = getValue(m);
    return v && labels.includes(v);
  });
  const base = validMissions.length;
  return labels.map((label) => {
    const count = validMissions.filter((m) => getValue(m) === label).length;
    return {
      label,
      count,
      pct: base > 0 ? Math.round((count / base) * 100) : 0,
    };
  });
}

export function AdminDistribution() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [timeFilter, setTimeFilter] = useState<DistributionFilter>(
    "Todo el tiempo"
  );

  useEffect(() => {
    if (!isUnlocked) return;
    const refresh = async () => {
      const data = await fetchMissionsForDistribution();
      setMissions(data);
    };
    void refresh();
    const unsub = subscribeToTableChanges("missions", () => void refresh());
    return unsub;
  }, [isUnlocked]);

  const filtered = useMemo(() => {
    const start = getFilterStart(timeFilter);
    if (!start) return missions;
    return missions.filter(
      (m) => new Date(m.created_at || m.updated_at) >= start
    );
  }, [missions, timeFilter]);

  const serviceBars = useMemo(
    () => buildBars(filtered, SERVICE_LABELS, (m) => m.service_type),
    [filtered]
  );

  const paymentBars = useMemo(
    () => buildBars(filtered, PAYMENT_LABELS, (m) => m.payment_method),
    [filtered]
  );

  const hasServiceData = serviceBars.some((b) => b.count > 0);
  const hasPaymentData = paymentBars.some((b) => b.count > 0);

  if (!isUnlocked) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Distribución
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Servicios y métodos de pago
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {DISTRIBUTION_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setTimeFilter(f)}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
              timeFilter === f
                ? "border-orbi-cyan/45 bg-orbi-blue/20 text-orbi-cyan"
                : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarGroup
          title="Por tipo de servicio"
          bars={serviceBars}
          hasData={hasServiceData}
        />
        <BarGroup
          title="Por método de pago"
          bars={paymentBars}
          hasData={hasPaymentData}
        />
      </div>

      <p className="text-[10px] text-orbi-muted/60">
        Incluye solicitudes activas, cumplidas y canceladas. Porcentajes
        calculados sobre misiones con campo válido en cada categoría.
      </p>
    </section>
  );
}

function BarGroup({
  title,
  bars,
  hasData,
}: {
  title: string;
  bars: Bar[];
  hasData: boolean;
}) {
  const max = Math.max(...bars.map((b) => b.count), 1);

  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4">
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        {title}
      </p>
      {!hasData ? (
        <p className="py-4 text-center text-xs text-orbi-muted">
          Sin datos en este periodo.
        </p>
      ) : (
        <div className="space-y-3">
          {bars.map((bar) => (
            <div key={bar.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-orbi-muted">
                  {bar.label}
                </span>
                <span className="whitespace-nowrap font-black text-orbi-text">
                  {bar.count} ({bar.pct}%)
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-orbi-blue shadow-glow transition-all duration-500"
                  style={{
                    width: `${bar.count > 0 ? Math.max(4, Math.round((bar.count / max) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
