"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, Orbit, Store, UsersRound } from "lucide-react";
import { AGENT_STATUS, getAgents } from "@/lib/agents";
import { getBusinesses } from "@/lib/businesses";
import { ActiveMission, fetchActiveMissions, fetchActiveMissionsCount, getMissionStatusLabel } from "@/lib/missions";
import { subscribeToAgents, subscribeToBusinesses, subscribeToTableChanges } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";

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

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

export function AdminLiveOperations() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [activeMissionsCount, setActiveMissionsCount] = useState(0);
  const [agentsInOrbit, setAgentsInOrbit] = useState(0);
  const [businessCount, setBusinessCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const [missionData, missionCount, agentData, businessData] = await Promise.all([
        fetchActiveMissions(),
        fetchActiveMissionsCount(),
        getAgents(),
        getBusinesses()
      ]);
      setMissions(missionData);
      setActiveMissionsCount(missionCount);
      setAgentsInOrbit(
        agentData.filter((a) => a.status === AGENT_STATUS.ONLINE && a.isOnOrbit).length
      );
      setBusinessCount(businessData.length);
    };

    void refresh();

    const unsubMissions = subscribeToTableChanges("missions", () => void refresh());
    const unsubAgents = subscribeToAgents(() => void refresh());
    const unsubBusinesses = subscribeToBusinesses(() => void refresh());

    return () => {
      unsubMissions();
      unsubAgents();
      unsubBusinesses();
    };
  }, []);

  useEffect(() => {
    const load = () => {
      void adminFetch("/api/requests/list")
        .then((r) => r.json())
        .then((rows: { status: string }[]) => {
          setPendingCount(rows.filter((r) => r.status === "pending").length);
        })
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 8_000);
    return () => { clearInterval(interval); };
  }, []);

  if (!isUnlocked) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Operación en vivo
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Estado actual de la red
        </h2>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LiveKpiCard
          icon={Orbit}
          label="Misiones activas"
          value={activeMissionsCount}
          accent={activeMissionsCount > 0}
        />
        <LiveKpiCard
          icon={UsersRound}
          label="Agentes en órbita"
          value={agentsInOrbit}
          accent={agentsInOrbit > 0}
        />
        <LiveKpiCard
          icon={Store}
          label="Negocios operativos"
          value={businessCount}
        />
        <LiveKpiCard
          icon={Bell}
          label="Solicitudes pendientes"
          value={pendingCount}
          accent={pendingCount > 0}
          accentColor="amber"
        />
      </div>

      {/* Compact mission list */}
      <div className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-orbi-panel/72">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Misiones activas ahora
          </p>
        </div>
        {missions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-orbi-muted">
            No hay misiones activas en este momento.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {missions.map((m) => (
              <MissionRow key={m.id} mission={m} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function LiveKpiCard({
  icon: Icon,
  label,
  value,
  accent = false,
  accentColor = "cyan"
}: {
  icon: typeof Orbit;
  label: string;
  value: number;
  accent?: boolean;
  accentColor?: "cyan" | "amber";
}) {
  const ringColor =
    accent && accentColor === "amber"
      ? "border-amber-400/25 bg-amber-400/[0.08]"
      : accent
      ? "border-orbi-cyan/25 bg-orbi-blue/10"
      : "border-white/10 bg-white/[0.04]";

  const iconColor =
    accent && accentColor === "amber" ? "text-amber-300" : "text-orbi-cyan";

  return (
    <article className={`rounded-md border p-4 ${ringColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-orbi-text">{value}</p>
          <p className="mt-1 text-xs font-semibold text-orbi-muted">{label}</p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] ${iconColor}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
    </article>
  );
}

function MissionRow({ mission }: { mission: ActiveMission }) {
  const statusDot: Record<string, string> = {
    esperando_negocio: "bg-amber-400",
    por_tomar: "bg-yellow-300",
    aceptada: "bg-orbi-cyan",
    en_mision: "bg-emerald-400"
  };

  return (
    <div className="grid grid-cols-[6rem_1fr_1fr_1fr_auto_auto] items-center gap-3 px-4 py-3 text-xs">
      <span className="font-mono font-bold text-orbi-muted">
        Folio: #{shortId(mission.id)}
      </span>
      <span className="truncate font-semibold text-orbi-text">
        {mission.service_type}
      </span>
      <span className="truncate text-orbi-muted">
        {mission.requester_name || "—"}
      </span>
      <span className="truncate text-orbi-muted">
        {mission.selected_agent_name || "Sin agente"}
      </span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span
          className={`h-1.5 w-1.5 rounded-full ${statusDot[mission.status] ?? "bg-white/30"}`}
        />
        <span className="text-orbi-cyan">{getMissionStatusLabel(mission.status)}</span>
      </span>
      <span className="whitespace-nowrap text-orbi-muted/70">
        {timeAgo(mission.updated_at || mission.last_updated_at)}
      </span>
    </div>
  );
}
