"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import type { ActivitySummary, ActivityPeriod, ActivitySearchResponse, ActivitySearchGroup } from "@/lib/types/admin-intelligence";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMXN(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmt0(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-MX");
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
}

// ─── Period filter ────────────────────────────────────────────────────────────

type PeriodOption = { label: string; value: ActivityPeriod };
const PERIODS: PeriodOption[] = [
  { label: "Hoy", value: "hoy" },
  { label: "Últimos 7 días", value: "7d" },
  { label: "Este mes", value: "mes" },
  { label: "Este año", value: "anio" },
  { label: "Todo el tiempo", value: "todo" },
  { label: "Rango personalizado", value: "custom" },
];

// ─── Metric cards ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-md border p-4 ${muted ? "border-white/10 bg-white/[0.03]" : "border-white/10 bg-white/[0.04]"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-orbi-muted">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${muted ? "text-orbi-muted" : "text-orbi-text"}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[10px] text-orbi-muted">{sub}</p> : null}
    </div>
  );
}

// ─── Search result group card ─────────────────────────────────────────────────

function GroupCard({ group }: { group: ActivitySearchGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                group.kind === "negocio"
                  ? "border-orbi-cyan/20 bg-orbi-blue/10 text-orbi-cyan"
                  : "border-yellow-300/15 bg-yellow-300/10 text-yellow-100"
              }`}
            >
              {group.kind === "negocio" ? "Negocio" : "Servicio"}
            </span>
            <p className="truncate font-black text-orbi-text">
              {group.businessName ?? group.serviceType}
            </p>
          </div>
          <p className="mt-1 text-xs text-orbi-muted">
            {fmt0(group.misiones)} misión{group.misiones !== 1 ? "es" : ""} ·{" "}
            {fmtMXN(group.facturacion)} facturado
          </p>
        </div>
        <span className="mt-1 shrink-0 text-orbi-muted">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/10 p-4 space-y-4">
          {/* Economic breakdown */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-orbi-muted">Ticket promedio</p>
              <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(group.ticketPromedio)}</p>
            </div>
            <div>
              <p className="text-[11px] text-orbi-muted">Comisión ORBI</p>
              <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(group.comisionOrbi)}</p>
            </div>
            <div>
              <p className="text-[11px] text-orbi-muted">Pago a agente</p>
              <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(group.pagoAgente)}</p>
            </div>
            {group.ingresoNegocio != null ? (
              <div>
                <p className="text-[11px] text-orbi-muted">Ingreso negocio</p>
                <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(group.ingresoNegocio)}</p>
              </div>
            ) : null}
          </div>

          {/* Coverage notice */}
          {group.cobertura ? (
            <p className="rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-orbi-muted">
              {group.cobertura}
            </p>
          ) : null}

          {/* Sample missions */}
          {group.sample.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-orbi-muted">
                Muestra de misiones
              </p>
              <div className="overflow-x-auto rounded border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="px-3 py-2 text-left font-bold text-orbi-muted">Servicio</th>
                      <th className="px-3 py-2 text-left font-bold text-orbi-muted">Producto</th>
                      <th className="px-3 py-2 text-right font-bold text-orbi-muted">Total</th>
                      <th className="px-3 py-2 text-left font-bold text-orbi-muted">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {group.sample.map((s) => (
                      <tr key={s.id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 text-orbi-muted">{s.serviceType}</td>
                        <td className="px-3 py-2 text-orbi-text">{s.productName ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orbi-text">
                          {fmtMXN(s.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-orbi-muted">{fmtDate(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {group.misiones > group.sample.length ? (
                <p className="mt-1 text-[10px] text-orbi-muted">
                  Mostrando {group.sample.length} de {group.misiones} misiones.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminIntelligenceActivity() {
  const [period, setPeriod] = useState<ActivityPeriod>("todo");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ActivitySearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Build query-string for the active period
  function periodParams(): string {
    const params = new URLSearchParams({ period });
    if (period === "custom") {
      if (customFrom) params.set("from", customFrom);
      if (customTo) params.set("to", customTo);
    }
    return params.toString();
  }

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await adminFetch(`/api/admin/intelligence/activity?${periodParams()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error ?? `Error ${res.status}`);
        return;
      }
      setSummary((await res.json()) as ActivitySummary);
    } catch {
      setLoadError("No fue posible cargar la actividad económica.");
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (period === "custom" && !customFrom) return; // wait for dates
    void loadSummary();
  }, [loadSummary, period, customFrom]);

  // Debounced search
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setSearchResult(null); setSearchError(""); return; }
    setIsSearching(true);
    setSearchError("");
    try {
      const params = new URLSearchParams({ q: trimmed, limit: "50", ...Object.fromEntries(new URLSearchParams(periodParams())) });
      const res = await adminFetch(`/api/admin/intelligence/activity/search?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSearchError(body.error ?? `Error ${res.status}`);
        setSearchResult(null);
        return;
      }
      setSearchResult((await res.json()) as ActivitySearchResponse);
    } catch {
      setSearchError("Error al buscar.");
    } finally {
      setIsSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (!query.trim()) { setSearchResult(null); setSearchError(""); return; }
    const t = setTimeout(() => void runSearch(query), 380);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const hasSearch = query.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-orbi-text">Actividad económica</h3>
            <p className="mt-0.5 text-xs text-orbi-muted">
              ¿Qué actividad económica generó ORBI? Solo misiones cumplidas. Solo lectura.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={isLoading}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:opacity-60"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Cargando..." : "Refrescar"}
          </button>
        </div>
      </div>

      {/* Period filters */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
              period === p.value
                ? "border-orbi-cyan/40 bg-orbi-blue/20 text-orbi-cyan"
                : "border-white/10 bg-white/[0.04] text-orbi-muted hover:border-white/20 hover:text-orbi-text"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom range inputs */}
      {period === "custom" ? (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-orbi-muted">Desde</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-orbi-text focus:border-orbi-cyan/30 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-orbi-muted">Hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-orbi-text focus:border-orbi-cyan/30 focus:outline-none"
            />
          </label>
        </div>
      ) : null}

      {/* Load error */}
      {loadError ? (
        <p className="rounded-md border border-red-300/15 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
          {loadError}
        </p>
      ) : null}

      {/* ── Indicators ─────────────────────────────────────────────────────── */}
      {!isLoading && summary ? (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-wide text-orbi-muted">
            ¿Cuánto se movió en este periodo?
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Misiones cumplidas"
              value={fmt0(summary.misionesCumplidas)}
            />
            <MetricCard
              label="Facturación total"
              value={fmtMXN(summary.facturacionTotal)}
            />
            <MetricCard
              label="Ticket promedio"
              value={fmtMXN(summary.ticketPromedio)}
            />
            <MetricCard
              label="Comisión ORBI"
              value={fmtMXN(summary.comisionOrbi)}
            />
            <MetricCard
              label="Pago a agentes"
              value={fmtMXN(summary.pagoAgentes)}
            />
            <MetricCard
              label="Ingreso de negocios"
              value={fmtMXN(summary.ingresoNegocios)}
              sub={
                summary.misionesConSubtotal > 0
                  ? `Basado en ${summary.misionesConSubtotal} de ${summary.misionesCumplidas} misiones con subtotal registrado.`
                  : "Disponible únicamente para misiones de compra en negocio con subtotal registrado."
              }
              muted={summary.ingresoNegocios == null}
            />
          </div>

          {/* Zero state */}
          {summary.misionesCumplidas === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
              No hay misiones cumplidas en este periodo.
            </p>
          ) : null}

          {/* Service types */}
          {summary.tiposServicio.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-orbi-muted">
                ¿Qué tipo de servicio generó actividad?
              </p>
              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="px-3 py-2 text-left text-xs font-bold text-orbi-muted">Tipo</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-orbi-muted">Misiones</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-orbi-muted">Facturación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {summary.tiposServicio.map((t) => (
                      <tr key={t.tipo} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-medium text-orbi-text">{t.tipo}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orbi-muted">{fmt0(t.count)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orbi-text">{fmtMXN(t.facturacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Active businesses */}
          {summary.negociosActivos.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-orbi-muted">
                ¿Qué negocios participaron?
              </p>
              <div className="space-y-2">
                {summary.negociosActivos.map((biz) => (
                  <div key={biz.businessId} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-orbi-text">{biz.businessName}</p>
                        <p className="text-xs text-orbi-muted">
                          {fmt0(biz.misiones)} misión{biz.misiones !== 1 ? "es" : ""} · Ticket prom. {fmtMXN(biz.ticketPromedio)}
                        </p>
                      </div>
                      <p className="text-sm font-black tabular-nums text-orbi-cyan">{fmtMXN(biz.facturacion)}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-orbi-muted">Comisión ORBI</p>
                        <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(biz.comisionOrbi)}</p>
                      </div>
                      <div>
                        <p className="text-orbi-muted">Pago agente</p>
                        <p className="mt-0.5 font-bold tabular-nums text-orbi-text">{fmtMXN(biz.pagoAgente)}</p>
                      </div>
                      <div>
                        <p className="text-orbi-muted">Ingreso negocio</p>
                        <p className="mt-0.5 font-bold tabular-nums text-orbi-text">
                          {biz.ingresoNegocio != null ? fmtMXN(biz.ingresoNegocio) : "Sin subtotal"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Economic search ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-orbi-muted">
          ¿Qué encontró ORBI para esta búsqueda?
        </p>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbi-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: Regina, café, jamón, traslado…"
            className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-4 text-sm text-orbi-text placeholder-orbi-muted focus:border-orbi-cyan/30 focus:outline-none"
          />
        </div>

        {/* Search states */}
        {hasSearch ? (
          isSearching ? (
            <p className="text-sm text-orbi-muted">Buscando en misiones cumplidas…</p>
          ) : searchError ? (
            <p className="text-sm font-semibold text-red-200">{searchError}</p>
          ) : searchResult ? (
            searchResult.groups.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-orbi-muted">
                  Sin evidencia de actividad para &ldquo;{searchResult.query}&rdquo; en misiones cumplidas.
                </p>
                <p className="mt-1 text-[11px] text-orbi-muted">
                  La búsqueda cubre: nombre de negocio, nombre de producto y tipo de servicio.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-orbi-muted">
                  {searchResult.total} grupo{searchResult.total !== 1 ? "s" : ""} con actividad para &ldquo;{searchResult.query}&rdquo;
                </p>
                {searchResult.groups.map((g, i) => (
                  <GroupCard key={g.businessId ?? `${g.serviceType}-${i}`} group={g} />
                ))}
              </div>
            )
          ) : null
        ) : null}
      </div>
    </div>
  );
}
