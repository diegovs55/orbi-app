"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ActiveMission,
  fetchMissionHistory,
  getMissionStatusLabel,
  MissionHistoryFilters,
} from "@/lib/missions";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

const SERVICE_OPTIONS = [
  "Todos",
  "Mandado",
  "Entrega",
  "Traslado",
  "Compra local",
  "Pago o trámite",
];

const STATUS_OPTIONS = [
  { value: "Todos", label: "Todos" },
  { value: "cumplida", label: "Cumplida" },
  { value: "cancelada", label: "Cancelada" },
  { value: "archivada", label: "Archivada" },
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// For folio/UUID comparison: strips "Folio:", "#", all spaces → lowercase.
function folioNorm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/folio:/gi, "")
    .replace(/#/g, "")
    .replace(/\s+/g, "")
    .trim();
}

// For text field comparison: just lowercase + trim, preserving word spaces.
function textNorm(v: unknown): string {
  return String(v ?? "").toLowerCase().trim();
}

const STATUS_DOT: Record<string, string> = {
  cumplida: "bg-emerald-400",
  cancelada: "bg-red-400",
  archivada: "bg-white/30",
};

export function AdminHistory() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );

  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [serviceType, setServiceType] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [search, setSearch] = useState("");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchDebounced, setSearchDebounced] = useState("");

  const doFetch = useCallback(async (filters: MissionHistoryFilters) => {
    setLoading(true);
    const result = await fetchMissionHistory(filters);
    setMissions(result.missions);
    setHasMore(result.hasMore);
    setTotal(result.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    void doFetch({ page, serviceType, status, search: searchDebounced });
  }, [doFetch, isUnlocked, page, serviceType, status, searchDebounced]);

  useEffect(() => { setPage(0); }, [serviceType, status, searchDebounced]);

  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(v), 400);
  };

  if (!isUnlocked) return null;

  const pageStart = page * 25 + 1;
  const pageEnd = Math.min((page + 1) * 25, total);

  // Client-side filter — two separate paths to avoid cross-contamination.
  const rawSearch = searchDebounced.trim();
  const fNorm = folioNorm(rawSearch);   // strip #/folio:/spaces → for UUID match
  const tNorm = textNorm(rawSearch);    // lowercase only → for name/service match
  const isFolioSearch = rawSearch !== "" && /^[0-9a-f]{4,12}$/.test(fNorm);

  const visibleMissions = rawSearch
    ? missions.filter((m) => {
        if (isFolioSearch) {
          // Match the 8-char folio displayed in the table, or anywhere in the full UUID.
          const displayFolio = m.id.slice(-8).toLowerCase();
          return displayFolio.includes(fNorm) || m.id.toLowerCase().includes(fNorm);
        }
        // Text search: preserve spaces so "jorge g" correctly matches "jorge garcía".
        return (
          textNorm(m.requester_name).includes(tNorm) ||
          textNorm(m.selected_agent_name).includes(tNorm) ||
          textNorm(m.service_type).includes(tNorm)
        );
      })
    : missions;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Historial
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Misiones cerradas
        </h2>
      </div>

      {/* Filters — 3 columns */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-orbi-muted">
          Servicio
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs font-semibold text-orbi-text outline-none focus:border-orbi-cyan/40"
          >
            {SERVICE_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-orbi-muted">
          Estado
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs font-semibold text-orbi-text outline-none focus:border-orbi-cyan/40"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-orbi-muted">
          Buscar
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nombre, agente, servicio o #folio…"
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs text-orbi-text placeholder:text-orbi-muted/50 outline-none focus:border-orbi-cyan/40"
          />
        </label>
      </div>

      {/* Table — 7 columns, no horizontal scroll on desktop */}
      <div className="overflow-hidden rounded-md border border-white/10">
        <table className="w-full table-fixed border-collapse text-left text-[11px]">
          <colgroup>
            <col className="w-[13%]" /> {/* Fecha */}
            <col className="w-[12%]" /> {/* Servicio */}
            <col className="w-[16%]" /> {/* Solicitante */}
            <col className="w-[16%]" /> {/* Agente */}
            <col className="w-[8%]" />  {/* Total */}
            <col className="w-[10%]" /> {/* Estado */}
            <col className="w-[25%]" /> {/* Folio + Acción */}
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {["Fecha", "Servicio", "Solicitante", "Agente", "Total", "Estado", "Folio / Acción"].map((h) => (
                <th
                  key={h}
                  className="px-2 py-2 font-bold uppercase tracking-[0.1em] text-orbi-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-orbi-muted">
                  Cargando…
                </td>
              </tr>
            ) : visibleMissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-orbi-muted">
                  Sin misiones en este filtro.
                </td>
              </tr>
            ) : (
              visibleMissions.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025]"
                >
                  <td className="truncate px-2 py-2 text-orbi-muted">
                    {formatDate(m.created_at || m.updated_at)}
                  </td>
                  <td className="truncate px-2 py-2 font-semibold text-orbi-text">
                    {m.service_type}
                  </td>
                  <td className="truncate px-2 py-2 text-orbi-text">
                    {m.requester_name || "—"}
                  </td>
                  <td className="truncate px-2 py-2 text-orbi-muted">
                    {m.selected_agent_name || "—"}
                  </td>
                  <td className="truncate px-2 py-2 font-bold text-orbi-text">
                    {(m.total_amount ?? 0) > 0
                      ? `$${(m.total_amount ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
                      : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[m.status] ?? "bg-white/30"}`} />
                      <span className="truncate text-orbi-muted">
                        {getMissionStatusLabel(m.status)}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] text-orbi-muted/70">
                        #{m.id.slice(-8).toUpperCase()}
                      </span>
                      <Link
                        href={`/orbita/${m.id}`}
                        className="shrink-0 rounded border border-orbi-cyan/25 px-1.5 py-0.5 text-[10px] font-semibold text-orbi-cyan transition hover:bg-orbi-cyan/10"
                      >
                        Ver órbita
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-orbi-muted">
          {total === 0
            ? "Sin resultados"
            : `${pageStart}–${pageEnd} de ${total} misiones`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:opacity-30 hover:bg-white/10 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <span className="flex items-center px-2 font-bold text-orbi-text">
            Pág. {page + 1}
          </span>
          <button
            type="button"
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:opacity-30 hover:bg-white/10 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>

      <p className="text-[10px] text-orbi-muted/60">
        <code className="font-mono">public.missions</code> ·{" "}
        <code className="font-mono">status IN (cumplida, cancelada, archivada)</code> ·
        25 por página · <code className="font-mono">created_at DESC</code>
      </p>
    </section>
  );
}
