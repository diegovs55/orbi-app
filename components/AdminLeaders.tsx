"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AGENT_STATUS, getAgents, OrbiAgent } from "@/lib/agents";
import { getCustomers, OrbiCustomer } from "@/lib/customers";
import { ActiveMission, fetchMissionsForRankings } from "@/lib/missions";
import {
  subscribeToAgents,
  subscribeToCustomers,
  subscribeToTableChanges,
} from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

type LeadersFilter =
  | "Hoy"
  | "Últimos 7 días"
  | "Este mes"
  | "Todo el tiempo";

const LEADERS_FILTERS: LeadersFilter[] = [
  "Hoy",
  "Últimos 7 días",
  "Este mes",
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

function getFilterStart(filter: LeadersFilter): Date | null {
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
  agents: OrbiAgent[]
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
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [customers, setCustomers] = useState<OrbiCustomer[]>([]);
  const [timeFilter, setTimeFilter] = useState<LeadersFilter>("Todo el tiempo");

  useEffect(() => {
    if (!isUnlocked) return;

    const refreshMissions = async () => {
      const data = await fetchMissionsForRankings();
      setMissions(data);
    };
    const refreshAgents = async () => {
      const data = await getAgents();
      setAgents(data);
    };
    const refreshCustomers = async () => {
      const data = await getCustomers();
      setCustomers(data);
    };

    void Promise.all([refreshMissions(), refreshAgents(), refreshCustomers()]);

    const unsubMissions = subscribeToTableChanges("missions", () =>
      void refreshMissions()
    );
    const unsubAgents = subscribeToAgents(() => void refreshAgents());
    const unsubCustomers = subscribeToCustomers(() => void refreshCustomers());

    return () => {
      unsubMissions();
      unsubAgents();
      unsubCustomers();
    };
  }, [isUnlocked]);

  const filteredMissions = useMemo(() => {
    const start = getFilterStart(timeFilter);
    if (!start) return missions;
    return missions.filter(
      (m) => new Date(m.created_at || m.updated_at) >= start
    );
  }, [missions, timeFilter]);

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
