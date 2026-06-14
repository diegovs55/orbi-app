"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RefreshCw, Trash2, UserRound } from "lucide-react";
import {
  AgentTrustLevel,
  OrbiAgent,
  agentLevels,
  deleteAgent,
  getAgentOperationalLabel,
  getAgents,
  hasValidAgentId,
  setAgentActiveStatus,
  setAgentTrustLevel
} from "@/lib/agents";
import { getMissionHistory } from "@/lib/missions";
import { subscribeToAgents } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

const operationalLabelStyles: Record<string, string> = {
  "En órbita": "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  "Fuera de horario": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-red-300/15 bg-red-400/10 text-red-200",
  "Fuera de zona": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de órbita": "border-white/10 bg-white/[0.04] text-orbi-muted"
};

export function AdminAgents() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [availabilityRefreshAt, setAvailabilityRefreshAt] = useState(() => new Date());

  const refreshAgents = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const next = await getAgents();
      setAgents(next);
      setAvailabilityRefreshAt(new Date());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No fue posible cargar los agentes.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    return subscribeToAgents(() => void refreshAgents({ silent: true }));
  }, [refreshAgents]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents]
  );

  const missionHistory = useMemo(() => getMissionHistory(), []);

  function getAgentStats(agentId: string) {
    const agentMissions = missionHistory.filter(
      (m) =>
        m.status === "cumplida" &&
        (m.active_agent_id === agentId ||
          m.selected_agent_id === agentId ||
          m.rated_agent_id === agentId)
    );
    const ratings = agentMissions
      .map((m) => m.rating)
      .filter((r): r is number => typeof r === "number" && r >= 1 && r <= 5);
    return {
      completed: agentMissions.length,
      avgRating: ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null
    };
  }

  function clearActionError(id: string) {
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleLevelChange(agent: OrbiAgent, level: AgentTrustLevel) {
    clearActionError(agent.id);
    try {
      await setAgentTrustLevel(agent.id, level);
      await refreshAgents({ silent: true });
    } catch (e) {
      setActionErrors((prev) => ({
        ...prev,
        [agent.id]: e instanceof Error ? e.message : "Error al cambiar nivel."
      }));
    }
  }

  async function handleToggleActive(agent: OrbiAgent) {
    clearActionError(agent.id);
    const wasActive = agent.isDemo !== true;
    try {
      await setAgentActiveStatus(agent.id, !wasActive);
      await refreshAgents({ silent: true });
    } catch (e) {
      setActionErrors((prev) => ({
        ...prev,
        [agent.id]: e instanceof Error ? e.message : "Error al cambiar estado."
      }));
    }
  }

  async function handleDelete(id: string) {
    clearActionError(id);
    if (!hasValidAgentId({ id })) {
      setActionErrors((prev) => ({ ...prev, [id]: "ID de agente inválido." }));
      return;
    }
    try {
      await deleteAgent(id);
      await refreshAgents({ silent: true });
    } catch (e) {
      setActionErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : "Error al eliminar agente."
      }));
    }
  }

  if (!isUnlocked) return null;

  return (
    <section className="mt-10 space-y-5">
      {/* ── Header ── */}
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <UserRound aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-black text-orbi-text">Agentes en la red</h2>
              <p className="mt-1 text-xs text-orbi-muted">
                Control de estado, nivel y desempeño. El agente gestiona su propio perfil operativo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
              {agents.length}
            </span>
            <button
              type="button"
              onClick={() => void refreshAgents({ silent: true })}
              disabled={isRefreshing}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Actualizando..." : "Refrescar"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-300/15 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Cargando agentes...
        </p>
      ) : sortedAgents.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Aún no hay agentes registrados. Aprueba solicitudes de alta para que aparezcan aquí.
        </p>
      ) : (
        <div className="space-y-3">
          {sortedAgents.map((agent) => {
            const operationalLabel = getAgentOperationalLabel(agent, availabilityRefreshAt);
            const stats = getAgentStats(agent.id);
            const labelStyle =
              operationalLabelStyles[operationalLabel] ??
              "border-white/10 bg-white/[0.04] text-orbi-muted";

            return (
              <article
                key={agent.id}
                className="rounded-md border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-orbi-text">{agent.name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${labelStyle}`}>
                        {operationalLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-orbi-muted">
                      {agent.serviceType} · {agent.zone}
                    </p>
                    <p className="mt-1 text-xs text-orbi-muted">
                      {agent.availability || "Sin horario configurado"}
                    </p>
                    {/* Metrics */}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <span className="text-orbi-muted">
                        Misiones completadas:{" "}
                        <span className="font-bold text-orbi-text">{stats.completed}</span>
                      </span>
                      <span className="text-orbi-muted">
                        Rating promedio:{" "}
                        <span className="font-bold text-orbi-text">
                          {stats.avgRating !== null
                            ? `${stats.avgRating.toFixed(1)} / 5`
                            : "Sin calificaciones"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Level selector */}
                    <div className="flex items-center gap-1.5">
                      <label className="sr-only">Nivel de {agent.name}</label>
                      <select
                        value={agent.trustLevel}
                        onChange={(e) =>
                          void handleLevelChange(agent, e.target.value as AgentTrustLevel)
                        }
                        className="rounded-md border border-orbi-cyan/20 bg-orbi-black px-2 py-1.5 text-xs font-bold text-orbi-cyan focus:outline-none"
                      >
                        {agentLevels.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Activate / Deactivate */}
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(agent)}
                      disabled={!hasValidAgentId(agent)}
                      className="inline-flex min-h-8 items-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text disabled:opacity-50"
                    >
                      {agent.status === "Disponible" ? "Desactivar" : "Activar"}
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => void handleDelete(agent.id)}
                      disabled={!hasValidAgentId(agent)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>

                {actionErrors[agent.id] ? (
                  <p className="mt-2 text-xs font-semibold text-red-300">
                    {actionErrors[agent.id]}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <p className="text-xs text-orbi-muted">
        Actualizado: {availabilityRefreshAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
    </section>
  );
}

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
