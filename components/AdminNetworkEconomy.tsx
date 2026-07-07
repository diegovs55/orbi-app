"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ActiveMission, fetchMissionsForEconomy } from "@/lib/missions";
import { subscribeToTableChanges } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

type EconomyFilter =
  | "Hoy"
  | "Últimos 7 días"
  | "Este mes"
  | "Este año"
  | "Todo el tiempo";

const ECONOMY_FILTERS: EconomyFilter[] = [
  "Hoy",
  "Últimos 7 días",
  "Este mes",
  "Este año",
  "Todo el tiempo",
];

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

function getFilterStart(filter: EconomyFilter): Date | null {
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

export function AdminNetworkEconomy() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [timeFilter, setTimeFilter] = useState<EconomyFilter>("Este mes");
  const [ledger, setLedger] = useState<{
    facturacionCliente: number;
    gananciaOrbi: number;
    pagosAgentes: number;
    pagosNegocios: number;
    takeRate: number | null;
    numMovimientos: number;
  } | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;
    const refresh = async () => {
      const data = await fetchMissionsForEconomy();
      setMissions(data);
    };
    void refresh();
    const unsub = subscribeToTableChanges("missions", () => void refresh());
    return unsub;
  }, [isUnlocked]);

  // Fetch ledger summary — se actualiza cuando cambia el filtro de tiempo
  useEffect(() => {
    if (!isUnlocked) return;
    const fetchLedger = async () => {
      const start = getFilterStart(timeFilter);
      const url = start
        ? `/api/ledger/summary?from=${encodeURIComponent(start.toISOString())}`
        : "/api/ledger/summary";
      try {
        const res = await adminFetch(url);
        if (res.ok) setLedger(await res.json() as typeof ledger);
      } catch {
        // Ledger no disponible — mantiene null (muestra "—")
      }
    };
    void fetchLedger();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, timeFilter]);

  const filtered = useMemo(() => {
    const start = getFilterStart(timeFilter);
    if (!start) return missions;
    return missions.filter((m) => new Date(m.created_at || m.updated_at) >= start);
  }, [missions, timeFilter]);

  const stats = useMemo(() => {
    const cumplidas = filtered.filter((m) => m.status === "cumplida");
    const canceladas = filtered.filter((m) => m.status === "cancelada");
    const total = cumplidas.length + canceladas.length;
    const facturacion = cumplidas.reduce((s, m) => s + (m.total_amount ?? 0), 0);
    const withAmount = cumplidas.filter((m) => (m.total_amount ?? 0) > 0);
    const ticketPromedio = withAmount.length
      ? facturacion / withAmount.length
      : 0;
    const tasaCumplimiento = total > 0 ? (cumplidas.length / total) * 100 : 0;
    return {
      cumplidas: cumplidas.length,
      canceladas: canceladas.length,
      facturacion,
      ticketPromedio,
      tasaCumplimiento,
    };
  }, [filtered]);

  if (!isUnlocked) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Economía de la red
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Facturación y cumplimiento
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {ECONOMY_FILTERS.map((f) => (
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EcoCard
          label="Facturación total"
          value={`$${stats.facturacion.toLocaleString("es-MX", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          sub="Suma de total_amount · misiones cumplidas"
        />
        <EcoCard
          label="Ticket promedio"
          value={
            stats.ticketPromedio > 0
              ? `$${stats.ticketPromedio.toLocaleString("es-MX", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}`
              : "—"
          }
          sub="total_amount promedio · cumplidas con monto"
        />
        <EcoCard
          label="Misiones cumplidas"
          value={String(stats.cumplidas)}
          sub={`${stats.canceladas} canceladas en el período`}
        />
        <EcoCard
          label="Tasa de cumplimiento"
          value={`${stats.tasaCumplimiento.toFixed(1)}%`}
          sub="cumplidas / (cumplidas + canceladas)"
          accent={stats.tasaCumplimiento >= 80}
        />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Estado financiero de la red
        </p>
        <p className="mt-0.5 text-[10px] text-orbi-muted/60">
          Datos del ledger — misiones con entrega confirmada en el período
        </p>
      </div>

      {/*
        MÉTRICAS DE INFRAESTRUCTURA — se activan al integrar pagos digitales.
        El ledger ya las soporta (estado='pending'). Ver /api/ledger/summary para
        el query exacto de cada métrica y los pasos para activarlas.
        Métricas pendientes: fondosEnCustodia · pendientesDeLiquidar · retirosPendientes
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <EcoCard
          label="Facturación clientes"
          value={
            ledger
              ? `$${ledger.facturacionCliente.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : "—"
          }
          sub="MISSION_PAYMENT · GMV del período"
        />
        <EcoCard
          label="Ganancia ORBI"
          value={
            ledger
              ? `$${ledger.gananciaOrbi.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : "—"
          }
          sub="MISSION_COMMISSION · 30% del service fee"
          accent={(ledger?.gananciaOrbi ?? 0) > 0}
        />
        <EcoCard
          label="Pagos a agentes"
          value={
            ledger
              ? `$${ledger.pagosAgentes.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : "—"
          }
          sub="MISSION_EARNING · 70% del service fee"
        />
        <EcoCard
          label="Pagos a negocios"
          value={
            ledger
              ? `$${ledger.pagosNegocios.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : "—"
          }
          sub="MISSION_EARNING · subtotal de productos"
        />
        <EcoCard
          label="Margen de plataforma"
          value={
            ledger
              ? ledger.takeRate !== null
                ? `${ledger.takeRate.toFixed(1)}%`
                : "—"
              : "—"
          }
          sub="gananciaOrbi / facturacionCliente · Take Rate"
          accent={(ledger?.takeRate ?? 0) >= 10}
        />
      </div>
    </section>
  );
}

function EcoCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-md border p-4 ${
        accent
          ? "border-emerald-400/25 bg-emerald-400/[0.06]"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <p
        className={`text-2xl font-black ${
          accent ? "text-emerald-300" : "text-orbi-text"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-orbi-muted">{label}</p>
      <p className="mt-2 text-[10px] leading-relaxed text-orbi-muted/60">{sub}</p>
    </article>
  );
}
