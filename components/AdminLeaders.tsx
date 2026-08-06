"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AGENT_STATUS } from "@/lib/agents";
import { fetchCustomersPage, OrbiCustomer } from "@/lib/customers";
import type { ActiveMission } from "@/lib/missions";
import { subscribeToTableChangesWithClient } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";
import { supabaseAdmin } from "@/lib/supabase-admin-client";
import type { AgentSummary } from "@/app/api/admin/agents/list/route";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

type LeadersFilter =
  | "Hoy"
  | "Últimos 7 días"
  | "Este mes"
  | "Todo el tiempo"
  | "Rango personalizado";

const LEADERS_FILTERS: LeadersFilter[] = [
  "Hoy",
  "Últimos 7 días",
  "Este mes",
  "Todo el tiempo",
  "Rango personalizado",
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

function getFilterStart(filter: LeadersFilter, customFrom?: string): Date | null {
  const now = new Date();
  if (filter === "Todo el tiempo" || filter === "Rango personalizado") {
    if (filter === "Rango personalizado" && customFrom) return new Date(customFrom);
    return null;
  }
  if (filter === "Hoy")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "Últimos 7 días") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (filter === "Este mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

// ── Agent ranking ─────────────────────────────────────────────────────────────

type AgentLeader = {
  id: string;
  name: string;
  missions: number;
  total: number;
  level: string;
  zone: string;
  isOnOrbit: boolean;
};

function buildAgentRanking(
  missions: ActiveMission[],
  agents: AgentSummary[]
): AgentLeader[] {
  const byId = new Map<string, { name: string; missions: number; total: number }>();

  for (const m of missions) {
    const id = m.selected_agent_id;
    const name = m.selected_agent_name || "Sin nombre";
    if (!id) continue;
    const cur = byId.get(id) ?? { name, missions: 0, total: 0 };
    byId.set(id, {
      name: cur.name || name,
      missions: cur.missions + 1,
      total: cur.total + (m.total_amount ?? 0),
    });
  }

  return Array.from(byId.entries())
    .map(([id, stats]) => {
      const agent = agents.find((a) => a.id === id);
      return {
        id,
        name: agent?.name ?? stats.name,
        missions: stats.missions,
        total: stats.total,
        level: agent?.trustLevel ?? "Aprendiz",
        zone: agent?.zone ?? "—",
        isOnOrbit: agent?.status === AGENT_STATUS.ONLINE && (agent?.isOnOrbit ?? false),
      };
    })
    .sort((a, b) => b.missions - a.missions)
    .slice(0, 5);
}

// ── Business ranking ──────────────────────────────────────────────────────────

type BusinessLeader = {
  name: string;
  missions: number;
};

function buildBusinessRanking(missions: ActiveMission[]): BusinessLeader[] {
  const byName = new Map<string, number>();

  for (const m of missions) {
    const name = m.business_name?.trim();
    if (!name) continue;
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }

  return Array.from(byName.entries())
    .map(([name, missions]) => ({ name, missions }))
    .sort((a, b) => b.missions - a.missions)
    .slice(0, 5);
}

// ── Customer ranking ──────────────────────────────────────────────────────────

type CustomerLeader = {
  name: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  isRegistered: boolean;
};

function buildCustomerRanking(customers: OrbiCustomer[]): CustomerLeader[] {
  return [...customers]
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .slice(0, 5)
    .map((c) => ({
      name: c.name || "—",
      phone: c.phone,
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent,
      isRegistered: c.isRegistered,
    }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminLeaders() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );

  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<OrbiCustomer[]>([]);
  const [timeFilter, setTimeFilter] = useState<LeadersFilter>("Todo el tiempo");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (!isUnlocked) return;

    const refreshMissions = async () => {
      setMissionsError(null);
      let res: Response;
      try {
        res = await adminFetch("/api/admin/missions/rankings");
      } catch {
        setMissionsError("Error de red al cargar misiones.");
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setMissionsError("Sesión Admin inválida — vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setMissionsError(`Error del servidor (${res.status})${body.error ? `: ${body.error}` : ""}.`);
        return;
      }
      const body = await res.json() as { missions: ActiveMission[] };
      setMissions(body.missions);
    };

    const refreshAgents = async () => {
      setAgentsError(null);
      let res: Response;
      try {
        res = await adminFetch("/api/admin/agents/list");
      } catch {
        setAgentsError("Error de red al cargar agentes.");
        return;
      }
      if (res.status === 401 || res.status === 403) {
        setAgentsError("Sesión Admin inválida — vuelve a iniciar sesión.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setAgentsError(`Error del servidor (${res.status})${body.error ? `: ${body.error}` : ""}.`);
        return;
      }
      const body = await res.json() as { agents: AgentSummary[] };
      setAgents(body.agents);
    };

    const refreshCustomers = async () => {
      const { customers: data } = await fetchCustomersPage({ page: 0 });
      setCustomers(data);
    };

    void Promise.all([refreshMissions(), refreshAgents(), refreshCustomers()]);

    const unsubMissions = subscribeToTableChangesWithClient(supabaseAdmin, "missions", () =>
      void refreshMissions()
    );
    const unsubAgents = subscribeToTableChangesWithClient(supabaseAdmin, "agents", () =>
      void refreshAgents()
    );
    const unsubCustomers = subscribeToTableChangesWithClient(supabaseAdmin, "customers", () =>
      void refreshCustomers()
    );

    return () => {
      unsubMissions();
      unsubAgents();
      unsubCustomers();
    };
  }, [isUnlocked]);

  const filteredMissions = useMemo(() => {
    const start = getFilterStart(timeFilter, customFrom);
    const endMs = timeFilter === "Rango personalizado" && customTo
      ? new Date(customTo + "T23:59:59").getTime()
      : null;
    return missions.filter((m) => {
      const mMs = new Date(m.created_at || m.updated_at).getTime();
      if (start && mMs < start.getTime()) return false;
      if (endMs !== null && mMs > endMs) return false;
      return true;
    });
  }, [missions, timeFilter, customFrom, customTo]);

  const agentRanking = useMemo(
    () => buildAgentRanking(filteredMissions, agents),
    [filteredMissions, agents]
  );

  const businessRanking = useMemo(
    () => buildBusinessRanking(filteredMissions),
    [filteredMissions]
  );

  const customerRanking = useMemo(
    () => buildCustomerRanking(customers),
    [customers]
  );

  if (!isUnlocked) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Líderes de la red
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Agentes, negocios y clientes
        </h2>
      </div>

      {missionsError && (
        <p role="alert" className="rounded-md border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-semibold text-red-300">
          {missionsError}
        </p>
      )}
      {agentsError && (
        <p role="alert" className="rounded-md border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-semibold text-red-300">
          {agentsError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {LEADERS_FILTERS.map((f) => (
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

      {timeFilter === "Rango personalizado" && (
        <div className="flex flex-wrap gap-3">
          <label className="block text-xs font-semibold text-orbi-muted">
            Desde
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="ml-2 rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-1.5 text-xs text-orbi-text outline-none focus:border-orbi-cyan/40"
            />
          </label>
          <label className="block text-xs font-semibold text-orbi-muted">
            Hasta
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="ml-2 rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-1.5 text-xs text-orbi-text outline-none focus:border-orbi-cyan/40"
            />
          </label>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agentes */}
        <LeaderPanel title="Agentes más activos" sub="por misiones cumplidas">
          {agentRanking.length === 0 ? (
            <Empty />
          ) : (
            agentRanking.map((a, i) => (
              <LeaderRow
                key={a.id}
                rank={i + 1}
                primary={a.name}
                secondary={`${a.level} · ${a.zone}`}
                stat={`${a.missions} misión${a.missions !== 1 ? "es" : ""}`}
                badge={a.isOnOrbit ? "En órbita" : undefined}
              />
            ))
          )}
        </LeaderPanel>

        {/* Negocios */}
        <LeaderPanel title="Negocios con más pedidos" sub="misiones cumplidas">
          {businessRanking.length === 0 ? (
            <Empty />
          ) : (
            businessRanking.map((b, i) => (
              <LeaderRow
                key={b.name}
                rank={i + 1}
                primary={b.name}
                stat={`${b.missions} misión${b.missions !== 1 ? "es" : ""}`}
              />
            ))
          )}
        </LeaderPanel>
      </div>

      {/* Clientes */}
      <LeaderPanel
        title="Clientes más frecuentes"
        sub="por pedidos acumulados en public.customers"
      >
        {customerRanking.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {customerRanking.map((c, i) => (
              <LeaderRow
                key={c.phone}
                rank={i + 1}
                primary={c.name}
                secondary={`${c.totalOrders} pedido${c.totalOrders !== 1 ? "s" : ""} · $${c.totalSpent.toFixed(0)} acumulados`}
                stat=""
                badge={c.isRegistered ? "Registrado" : undefined}
              />
            ))}
          </div>
        )}
      </LeaderPanel>

      <p className="text-[10px] text-orbi-muted/60">
        Agentes y negocios: misiones con{" "}
        <code className="font-mono">status = &apos;cumplida&apos;</code> ·
        Clientes:{" "}
        <code className="font-mono">public.customers.total_orders</code> ·
        Sin rating ni datos estimados.
      </p>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LeaderPanel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        {title}
      </p>
      <p className="mb-4 mt-0.5 text-[10px] text-orbi-muted/70">{sub}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LeaderRow({
  rank,
  primary,
  secondary,
  stat,
  badge,
}: {
  rank: number;
  primary: string;
  secondary?: string;
  stat: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 shrink-0 text-xs font-black text-orbi-cyan/60">
          {rank}.
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-orbi-text">{primary}</p>
          {secondary ? (
            <p className="mt-0.5 text-[10px] text-orbi-muted/70">{secondary}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {stat ? (
          <span className="text-xs font-black text-orbi-cyan">{stat}</span>
        ) : null}
        {badge ? (
          <span className="rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-2 py-0.5 text-[10px] font-bold text-orbi-cyan">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-3 text-center text-xs text-orbi-muted">
      Sin datos en este periodo.
    </p>
  );
}
