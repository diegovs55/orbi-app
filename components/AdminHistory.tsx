"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  { value: "Todos", label: "Todos los estados" },
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

  // Filter state
  const [serviceType, setServiceType] = useState("Todos");
  const [agentName, setAgentName] = useState("");
  const [status, setStatus] = useState("Todos");
  const [requesterSearch, setRequesterSearch] = useState("");

  // Debounce refs for text inputs
  const agentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requesterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [agentNameDebounced, setAgentNameDebounced] = useState("");
  const [requesterDebounced, setRequesterDebounced] = useState("");

  const fetch = useCallback(
    async (filters: MissionHistoryFilters) => {
      setLoading(true);
      const result = await fetchMissionHistory(filters);
      setMissions(result.missions);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setLoading(false);
    },
    []
  );

  // Re-fetch whenever any filter or page changes
  useEffect(() => {
    if (!isUnlocked) return;
    void fetch({
      page,
      serviceType,
      agentName: agentNameDebounced,
      status,
      requesterSearch: requesterDebounced,
    });
  }, [fetch, isUnlocked, page, serviceType, agentNameDebounced, status, requesterDebounced]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [serviceType, agentNameDebounced, status, requesterDebounced]);

  // Debounce agent name input
  const handleAgentName = (v: string) => {
    setAgentName(v);
    if (agentTimer.current) clearTimeout(agentTimer.current);
    agentTimer.current = setTimeout(() => setAgentNameDebounced(v), 400);
  };

  // Debounce requester input
  const handleRequester = (v: string) => {
    setRequesterSearch(v);
    if (requesterTimer.current) clearTimeout(requesterTimer.current);
    requesterTimer.current = setTimeout(() => setRequesterDebounced(v), 400);
  };

  if (!isUnlocked) return null;

  const pageStart = page * 25 + 1;
  const pageEnd = Math.min((page + 1) * 25, total);

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

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          Agente
          <input
            type="text"
            value={agentName}
            onChange={(e) => handleAgentName(e.target.value)}
            placeholder="Nombre del agente…"
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs text-orbi-text placeholder:text-orbi-muted/50 outline-none focus:border-orbi-cyan/40"
          />
        </label>

        <label className="block text-xs font-semibold text-orbi-muted">
          Solicitante
          <input
            type="text"
            value={requesterSearch}
            onChange={(e) => handleRequester(e.target.value)}
            placeholder="Nombre del solicitante…"
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs text-orbi-text placeholder:text-orbi-muted/50 outline-none focus:border-orbi-cyan/40"
          />
        </label>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {["Fecha", "Servicio", "Solicitante", "Agente", "Total", "Estado", "ID"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-bold uppercase tracking-[0.14em] text-orbi-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-orbi-muted">
                    Cargando…
                  </td>
                </tr>
              ) : missions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-orbi-muted">
                    Sin misiones en este filtro.
                  </td>
                </tr>
              ) : (
                missions.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025]"
                  >
                    <td className="px-4 py-3 text-orbi-muted">
                      {formatDate(m.created_at || m.updated_at)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-orbi-text">
                      {m.service_type}
                    </td>
                    <td className="px-4 py-3 text-orbi-text">
                      {m.requester_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-orbi-muted">
                      {m.selected_agent_name || "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-orbi-text">
                      {(m.total_amount ?? 0) > 0
                        ? `$${(m.total_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[m.status] ?? "bg-white/30"}`}
                        />
                        <span className="text-orbi-muted">
                          {getMissionStatusLabel(m.status)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-orbi-muted/60">
                      Folio: #{m.id.slice(-8).toUpperCase()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
            Página {page + 1}
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
        Fuente:{" "}
        <code className="font-mono">public.missions</code> ·{" "}
        <code className="font-mono">status IN (cumplida, cancelada, archivada)</code> ·
        25 registros por página · ordenado por{" "}
        <code className="font-mono">created_at DESC</code> · filtros aplicados en Supabase.
      </p>
    </section>
  );
}
