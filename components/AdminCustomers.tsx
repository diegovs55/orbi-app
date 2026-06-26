"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { UsersRound } from "lucide-react";
import {
  CustomerPageFilters,
  CustomerStats,
  fetchCustomerStats,
  fetchCustomersPage,
  OrbiCustomer,
} from "@/lib/customers";
import { subscribeToCustomers } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

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
  try {
    return new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function displayPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  if (d.length === 12)
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
  return phone;
}

export function AdminCustomers() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );

  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    registered: 0,
    totalOrders: 0,
    totalSpent: 0,
  });
  const [customers, setCustomers] = useState<OrbiCustomer[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [isRegisteredFilter, setIsRegisteredFilter] = useState<
    boolean | null
  >(null);
  const [statusFilter, setStatusFilter] = useState("todos");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStats = useCallback(async () => {
    const s = await fetchCustomerStats();
    setStats(s);
  }, []);

  const refreshPage = useCallback(
    async (filters: CustomerPageFilters) => {
      setLoading(true);
      const result = await fetchCustomersPage(filters);
      setCustomers(result.customers);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setLoading(false);
    },
    []
  );

  // Initial load + realtime
  useEffect(() => {
    if (!isUnlocked) return;
    void refreshStats();
    const unsub = subscribeToCustomers(() => {
      void refreshStats();
      void refreshPage({
        page,
        search: searchDebounced,
        isRegistered: isRegisteredFilter,
        status: statusFilter,
      });
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked]);

  // Re-fetch page on filter/page change
  useEffect(() => {
    if (!isUnlocked) return;
    void refreshPage({
      page,
      search: searchDebounced,
      isRegistered: isRegisteredFilter,
      status: statusFilter,
    });
  }, [isUnlocked, page, searchDebounced, isRegisteredFilter, statusFilter, refreshPage]);

  // Reset to page 0 on filter change
  useEffect(() => {
    setPage(0);
  }, [searchDebounced, isRegisteredFilter, statusFilter]);

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(v), 400);
  };

  if (!isUnlocked) return null;

  const pageStart = page * 25 + 1;
  const pageEnd = Math.min((page + 1) * 25, total);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <UsersRound aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-orbi-text">
            Clientes de Red Orbi
          </h2>
          <p className="text-xs text-orbi-muted">
            Identificados por número de WhatsApp · paginado desde{" "}
            <code className="font-mono">public.customers</code>
          </p>
        </div>
      </div>

      {/* KPI cards — aggregated from all customers, not just current page */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Total clientes" value={String(stats.total)} />
        <MetricTile
          label="Pedidos totales"
          value={String(stats.totalOrders)}
        />
        <MetricTile
          label="Gasto acumulado"
          value={stats.totalSpent > 0 ? `$${stats.totalSpent.toFixed(0)}` : "—"}
        />
        <MetricTile
          label="Registrados"
          value={String(stats.registered)}
        />
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-orbi-muted">
          Buscar nombre o teléfono
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nombre o número…"
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs text-orbi-text placeholder:text-orbi-muted/50 outline-none focus:border-orbi-cyan/40"
          />
        </label>

        <label className="block text-xs font-semibold text-orbi-muted">
          Registro
          <select
            value={
              isRegisteredFilter === null
                ? "todos"
                : isRegisteredFilter
                ? "registrado"
                : "anonimo"
            }
            onChange={(e) => {
              const v = e.target.value;
              setIsRegisteredFilter(
                v === "todos" ? null : v === "registrado"
              );
            }}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs font-semibold text-orbi-text outline-none focus:border-orbi-cyan/40"
          >
            <option value="todos">Todos</option>
            <option value="registrado">Registrado</option>
            <option value="anonimo">Anónimo</option>
          </select>
        </label>

        <label className="block text-xs font-semibold text-orbi-muted">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs font-semibold text-orbi-text outline-none focus:border-orbi-cyan/40"
          >
            <option value="todos">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[700px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              {[
                "Nombre",
                "WhatsApp",
                "Pedidos",
                "Gasto acumulado",
                "Último pedido",
                "Registro",
                "Status",
              ].map((h) => (
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
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-orbi-muted"
                >
                  Cargando…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-orbi-muted"
                >
                  {total === 0 && !search && isRegisteredFilter === null
                    ? "Aún no hay clientes. Se crean automáticamente al enviar la primera misión."
                    : "Sin resultados para este filtro."}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.025]"
                >
                  <td className="px-4 py-3 font-semibold text-orbi-text">
                    {c.name || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-orbi-cyan">
                    {displayPhone(c.phone)}
                  </td>
                  <td className="px-4 py-3 text-center text-orbi-text">
                    {c.totalOrders}
                  </td>
                  <td className="px-4 py-3 font-semibold text-orbi-text">
                    {c.totalSpent > 0 ? `$${c.totalSpent.toFixed(0)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-orbi-muted">
                    {formatDate(c.lastOrderAt)}
                  </td>
                  <td className="px-4 py-3">
                    {c.isRegistered ? (
                      <span className="rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-2 py-0.5 text-[10px] font-bold text-orbi-cyan">
                        Registrado
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-orbi-muted">
                        Anónimo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        (c.customerStatus ?? "activo") === "activo"
                          ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300"
                          : "border-white/10 bg-white/[0.04] text-orbi-muted"
                      }`}
                    >
                      {c.customerStatus ?? "activo"}
                    </span>
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
            : `${pageStart}–${pageEnd} de ${total} clientes`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/10"
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
            className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/10"
          >
            Siguiente →
          </button>
        </div>
      </div>

      <p className="text-[10px] text-orbi-muted/60">
        Fuente:{" "}
        <code className="font-mono">public.customers</code> · 25 por página ·
        filtros aplicados en Supabase · KPIs sobre total de clientes.
      </p>

    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-orbi-text">{value}</p>
    </div>
  );
}
