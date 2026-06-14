"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Navigation, Orbit, PackageCheck, RefreshCw, ShieldCheck, UserRound, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGENT_STATUS,
  AgentServiceType,
  getAgentCurrentLocation,
  getAgentLocation,
  getAgentOperationalLabel,
  getAgentOperatingEligibility,
  getAgents,
  OrbiAgent
} from "@/lib/agents";
import { subscribeToAgents } from "@/lib/supabase";
import {
  ActiveMission,
  getActiveMissions,
  getMissionStatusLabel,
  getMissionHistory,
  isMissionActive,
  isMissionClosed,
  isMissionPending,
  loadActiveMissionsFromSupabase,
  subscribeToMission,
  updateActiveMissionById
} from "@/lib/missions";

const statusStyles: Record<OrbiAgent["status"], string> = {
  [AGENT_STATUS.ONLINE]: "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  [AGENT_STATUS.OFFLINE]: "border-white/10 bg-white/5 text-orbi-muted"
};

const operationalLabelStyles: Record<string, string> = {
  "En órbita": "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  "Fuera de horario": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-red-300/15 bg-red-400/10 text-red-200",
  "Fuera de zona": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de órbita": "border-white/10 bg-white/[0.04] text-orbi-muted"
};

export function AgentCards({ agentId }: { agentId?: string } = {}) {
  const router = useRouter();
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [availabilityRefreshAt, setAvailabilityRefreshAt] = useState(() => new Date());
  const [profileAgent, setProfileAgent] = useState<OrbiAgent | null>(null);
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [missionMessage, setMissionMessage] = useState("");

  const refreshAgents = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const nextAgents = await getAgents();
      setAgents(nextAgents);
      setAvailabilityRefreshAt(new Date());
      setError("");
    } catch (caughtError: unknown) {
      setAgents([]);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible cargar los agentes Orbi."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setError("La consulta de agentes tardó demasiado. Revisa la conexión con Supabase.");
      setIsLoading(false);
    }, 8000);

    getAgents()
      .then((nextAgents) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents(nextAgents);
        setAvailabilityRefreshAt(new Date());
        setError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents([]);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No fue posible cargar los agentes Orbi."
        );
      })
      .finally(() => {
        if (isActive) {
          window.clearTimeout(timeoutId);
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    function refreshOnFocus() {
      void refreshAgents({ silent: true });
    }

    function refreshOnVisibility() {
      if (document.visibilityState === "visible") {
        void refreshAgents({ silent: true });
      }
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [refreshAgents]);

  useEffect(() => {
    return subscribeToAgents(() => {
      void refreshAgents({ silent: true });
    });
  }, [refreshAgents]);

  useEffect(() => {
    const load = async () => {
      await loadActiveMissionsFromSupabase();
      setMissions(getActiveMissions());
    };
    void load();
    return subscribeToMission(() => void load());
  }, []);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  const pendingMissions = useMemo(() => {
    const open = missions.filter((m) => !isMissionClosed(m));
    // When an agent is identified, show only unassigned missions + their own missions.
    if (!agentId) return open;
    return open.filter(
      (m) => isMissionPending(m) || m.active_agent_id === agentId || m.selected_agent_id === agentId
    );
  }, [missions, agentId]);

  const missionBoardItems = useMemo(() => {
    return pendingMissions.map((m) => ({
      mission: m,
      agents: sortedAgents
        .map((agent) => ({ agent, distance: getAgentDistanceFromMission(agent, m) }))
        .filter(({ agent, distance }) => canAgentSeeMission(agent, m, distance, availabilityRefreshAt))
        .sort((a, b) => {
          if (a.distance === null && b.distance === null) return a.agent.name.localeCompare(b.agent.name);
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        })
        .map(({ agent }) => agent)
    }));
  }, [availabilityRefreshAt, pendingMissions, sortedAgents]);

  function handleAcceptMission(agent: OrbiAgent, targetMission: ActiveMission) {
    const currentLocation = getAgentCurrentLocation(agent);
    updateActiveMissionById(targetMission.id, {
      status: "aceptada",
      selected_agent_id: agent.id,
      selected_agent_name: agent.name,
      selected_agent_zone: agent.zone,
      selected_agent_vehicle: agent.vehicle,
      selected_agent_trust: agent.trustLevel,
      selected_agent_lat: currentLocation?.lat ?? agent.currentLat ?? agent.lat,
      selected_agent_lng: currentLocation?.lng ?? agent.currentLng ?? agent.lng,
      active_agent_id: agent.id,
      accepted_at: new Date().toISOString()
    });
    setMissions(getActiveMissions());
    setMissionMessage("Misión aceptada. Ya estás en órbita.");
    router.push("/orbita");
  }

  function handleCancelMission(agent: OrbiAgent, targetMission: ActiveMission) {
    if (!canAgentSeeMission(agent, targetMission, getAgentDistanceFromMission(agent, targetMission), availabilityRefreshAt)) {
      return;
    }
    updateActiveMissionById(targetMission.id, {
      status: "cancelada",
      active_agent_id: targetMission.active_agent_id || agent.id
    });
    setMissions(getActiveMissions());
    setMissionMessage("Misión cancelada y archivada en historial.");
  }

  function handleAdvanceMission(targetMission: ActiveMission) {
    if (targetMission.status === "aceptada") {
      updateActiveMissionById(targetMission.id, { status: "en_mision" });
      setMissions(getActiveMissions());
      setMissionMessage("Ruta iniciada. Misión en curso.");
    } else if (targetMission.status === "en_mision") {
      updateActiveMissionById(targetMission.id, { status: "cumplida" });
      setMissions(getActiveMissions());
      setMissionMessage("Entrega confirmada. Misión cumplida.");
    }
  }

  if (isLoading) {
    return (
      <>
        <MissionBoards items={missionBoardItems} message={missionMessage} onAccept={handleAcceptMission} onCancel={handleCancelMission} onAdvance={handleAdvanceMission} />
        <StateCard title="Cargando agentes Orbi..." body="Estamos consultando la red activa." />
      </>
    );
  }

  if (error) {
    return (
      <>
        <MissionBoards items={missionBoardItems} message={missionMessage} onAccept={handleAcceptMission} onCancel={handleCancelMission} onAdvance={handleAdvanceMission} />
        <StateCard title="No pudimos cargar los agentes." body={error} tone="error" />
      </>
    );
  }

  if (!sortedAgents.length) {
    return (
      <>
        <MissionBoards items={missionBoardItems} message={missionMessage} onAccept={handleAcceptMission} onCancel={handleCancelMission} onAdvance={handleAdvanceMission} />
        <StateCard
          title="Aún no hay agentes Orbi registrados."
          body="Pronto podrás ver aquí perfiles verificados para recibir apoyo local."
        />
      </>
    );
  }

  return (
    <>
      <MissionBoards items={missionBoardItems} message={missionMessage} onAccept={handleAcceptMission} onCancel={handleCancelMission} onAdvance={handleAdvanceMission} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-3">
        <div>
          <p className="text-sm font-black text-orbi-text">Disponibilidad recalculada</p>
          <p className="mt-1 text-xs text-orbi-muted">
            Última revisión: {availabilityRefreshAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAgents({ silent: true })}
          disabled={isRefreshing}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Actualizando..." : "Refrescar agentes"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sortedAgents.map((agent) => {
          const operationalLabel = getAgentOperationalLabel(agent, availabilityRefreshAt);

          return (
          <article
            key={agent.id}
            className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-orbi-cyan/35"
          >
            <div className="flex items-start gap-4">
              <AgentAvatar agent={agent} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black leading-tight text-orbi-text">{agent.name}</h2>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      operationalLabelStyles[operationalLabel] ?? statusStyles[agent.status]
                    }`}
                  >
                    {operationalLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-orbi-muted">{agent.description}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {agent.vehicle ? <InfoTile label="Vehículo" value={agent.vehicle} /> : null}
              <InfoTile label="Nivel" value={agent.trustLevel} />
              <InfoTile label="Calificación" value={formatAgentRating(getAgentRatingStats(agent.id))} />
            </div>

            <button
              type="button"
              onClick={() => setProfileAgent(agent)}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-5 py-3 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              Ver perfil
            </button>
          </article>
          );
        })}
      </div>

      {profileAgent ? (
        <ProfileModal agent={profileAgent} onClose={() => setProfileAgent(null)} />
      ) : null}
    </>
  );
}

function MissionBoards({
  items,
  message,
  onAccept,
  onCancel,
  onAdvance
}: {
  items: { mission: ActiveMission; agents: OrbiAgent[] }[];
  message: string;
  onAccept: (agent: OrbiAgent, mission: ActiveMission) => void;
  onCancel: (agent: OrbiAgent, mission: ActiveMission) => void;
  onAdvance: (mission: ActiveMission) => void;
}) {
  if (items.length === 0) {
    return (
      <AgentMissionBoard
        agents={[]}
        mission={null}
        message={message}
        onAccept={() => {}}
        onCancel={() => {}}
        onAdvance={() => {}}
      />
    );
  }
  return (
    <>
      {items.map(({ mission: m, agents }) => (
        <AgentMissionBoard
          key={m.id}
          agents={agents}
          mission={m}
          message={message}
          onAccept={(agent) => onAccept(agent, m)}
          onCancel={(agent) => onCancel(agent, m)}
          onAdvance={() => onAdvance(m)}
        />
      ))}
    </>
  );
}

function AgentMissionBoard({
  agents,
  mission,
  message,
  onAccept,
  onCancel,
  onAdvance
}: {
  agents: OrbiAgent[];
  mission: ActiveMission | null;
  message: string;
  onAccept: (agent: OrbiAgent) => void;
  onCancel: (agent: OrbiAgent) => void;
  onAdvance: () => void;
}) {
  const hasMissionForAgents = Boolean(mission && agents.length);

  return (
    <section className="mb-6 space-y-4">
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <Orbit aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-black text-orbi-text">Misiones por tomar</h2>
            <p className="mt-1 text-xs text-orbi-muted">
              Cada agente ve misiones compatibles con su servicio o asignadas a su órbita.
            </p>
          </div>
        </div>
      </div>

      {message ? (
        <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
          {message}
        </p>
      ) : null}

      {!mission ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          No hay misiones pendientes en la red local.
        </p>
      ) : isMissionClosed(mission) ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          La última misión ya fue cerrada y quedó archivada en historial.
        </p>
      ) : hasMissionForAgents ? (
        <div className="grid gap-4">
          {agents.map((agent) => {
            const isAssigned = isMissionActive(mission) && mission.active_agent_id === agent.id;
            const distance = getAgentDistanceFromMission(agent, mission);
            return (
              <article
                key={`${mission.id}-${agent.id}`}
                className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                      {isAssigned ? "Misión asignada a este agente" : "Agente sugerido"}
                    </p>
                    <h3 className="mt-1 text-xl font-black text-orbi-text">{mission.service_type}</h3>
                    <p className="mt-2 text-sm leading-6 text-orbi-muted">{mission.detail}</p>
                  </div>
                  <span className="w-fit rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
                    {mission.status === "por_tomar" ? "Por tomar" : getMissionStatusLabel(mission.status)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <InfoTile label="Agente" value={agent.name} />
                  <InfoTile label="Agente seleccionado" value={mission.selected_agent_name} />
                  <InfoTile
                    label="Cercanía al origen"
                    value={distance === null ? "Sin distancia calculada" : `${distance.toFixed(1)} km`}
                  />
                  <InfoTile label="Origen" value={mission.origin_text} />
                  <InfoTile label="Destino" value={mission.destination_text} />
                  <InfoTile label="Solicitante" value={mission.requester_name} />
                  <InfoTile label="Teléfono" value={mission.requester_phone} />
                  <InfoTile label="Estado de pago" value={mission.payment_status} />
                  <InfoTile label="Método de pago" value={mission.payment_method} />
                  <InfoTile label="Órbita estimada" value={mission.estimated_orbit} />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {isMissionPending(mission) ? (
                    <button
                      type="button"
                      onClick={() => onAccept(agent)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      Aceptar misión
                    </button>
                  ) : null}
                  {mission.status === "aceptada" ? (
                    <button
                      type="button"
                      onClick={onAdvance}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                    >
                      <Navigation aria-hidden="true" className="h-4 w-4" />
                      Iniciar ruta
                    </button>
                  ) : null}
                  {mission.status === "en_mision" ? (
                    <button
                      type="button"
                      onClick={onAdvance}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                    >
                      <PackageCheck aria-hidden="true" className="h-4 w-4" />
                      Confirmar entrega
                    </button>
                  ) : null}
                  {!isMissionClosed(mission) ? (
                    <button
                      type="button"
                      onClick={() => onCancel(agent)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
                    >
                      <XCircle aria-hidden="true" className="h-4 w-4" />
                      Cancelar misión
                    </button>
                  ) : null}
                  {isMissionActive(mission) ? (
                    <Link
                      href="/orbita"
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
                    >
                      Ver en órbita
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Hay una misión pendiente, pero ningún agente activo coincide por servicio, ubicación operativa y radio.
        </p>
      )}
    </section>
  );
}

function ProfileModal({ agent, onClose }: { agent: OrbiAgent; onClose: () => void }) {
  const ratingStats = getAgentRatingStats(agent.id);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-md border border-orbi-cyan/20 bg-orbi-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AgentAvatar agent={agent} />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
                Perfil de confianza
              </p>
              <h2 className="mt-1 text-2xl font-black text-orbi-text">{agent.name}</h2>
              <p className="mt-1 text-sm text-orbi-muted">{agent.status}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar perfil"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text transition hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-5 text-sm leading-6 text-orbi-muted">{agent.description}</p>
        <div className="mt-5 grid gap-2 text-xs sm:grid-cols-2">
          <InfoTile label="Estado" value={agent.status} />
          {agent.availability ? <InfoTile label="Horario" value={agent.availability} /> : null}
          <InfoTile label="Zona" value={agent.zone} />
          {agent.vehicle ? <InfoTile label="Vehículo" value={agent.vehicle} /> : null}
          <InfoTile label="Nivel" value={agent.trustLevel} />
          <InfoTile label="Servicios que cubre" value={agent.serviceType} />
          <InfoTile label="Radio operativo" value={`${agent.radiusKm || 20} km`} />
          <InfoTile
            label="Rating promedio"
            value={ratingStats.count ? `${ratingStats.average.toFixed(1)} / 5` : "Sin calificaciones"}
          />
          <InfoTile label="Misiones calificadas" value={String(ratingStats.count)} />
          <InfoTile
            label="Ubicación operativa"
            value={
              getAgentLocation(agent)
                ? `${getAgentLocation(agent)!.lat.toFixed(6)}, ${getAgentLocation(agent)!.lng.toFixed(6)}`
                : "Sin ubicación registrada"
            }
          />
        </div>
      </section>
    </div>
  );
}

function getAgentRatingStats(agentId: string) {
  const ratings = getMissionHistory()
    .filter(
      (mission) =>
        mission.status === "cumplida" &&
        (mission.rated_agent_id || mission.active_agent_id || mission.selected_agent_id) === agentId
    )
    .map((mission) => mission.rating)
    .filter((rating): rating is number => typeof rating === "number" && rating >= 1 && rating <= 5);

  return {
    count: ratings.length,
    average: ratings.length ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length : 0
  };
}

function formatAgentRating(ratingStats: { count: number; average: number }) {
  return ratingStats.count
    ? `★★★★★ ${ratingStats.average.toFixed(1)} · ${ratingStats.count} ${ratingStats.count === 1 ? "misión calificada" : "misiones calificadas"}`
    : "Sin calificaciones";
}

function AgentAvatar({ agent }: { agent: OrbiAgent }) {
  if (agent.photoUrl) {
    return (
      <div
        aria-label={agent.name}
        role="img"
        className="h-16 w-16 shrink-0 rounded-md border border-orbi-cyan/20 bg-cover bg-center"
        style={{ backgroundImage: `url(${agent.photoUrl})` }}
      />
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-lg font-black text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)]">
      {agent.initials || <UserRound aria-hidden="true" className="h-7 w-7" />}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function canAgentSeeMission(agent: OrbiAgent, mission: ActiveMission, distance: number | null, now = new Date()) {
  if (isMissionClosed(mission)) {
    return false;
  }

  const isAssigned = isMissionActive(mission) && mission.active_agent_id === agent.id;

  if (isAssigned) {
    return true;
  }

  const origin = hasMissionOriginCoordinates(mission)
    ? { lat: mission.origin_lat as number, lng: mission.origin_lng as number }
    : null;
  const eligibility = getAgentOperatingEligibility(agent, getCompatibleServiceType(mission.service_type), origin, now);

  return isMissionPending(mission) && eligibility.eligible && distance !== null;
}

function getCompatibleServiceType(missionService: string): AgentServiceType {
  const serviceMap: Record<string, AgentServiceType> = {
    Mandado: "Mandados",
    Entrega: "Entregas",
    Traslado: "Traslados",
    "Compra local": "Compras",
    Recolección: "Recolecciones",
    "Pago o trámite": "Mandados"
  };

  return serviceMap[missionService] ?? "Mandados";
}

function hasMissionOriginCoordinates(mission: ActiveMission) {
  return (
    mission.origin_lat !== null &&
    mission.origin_lng !== null &&
    Number.isFinite(mission.origin_lat) &&
    Number.isFinite(mission.origin_lng)
  );
}

function getAgentDistanceFromMission(agent: OrbiAgent, mission: ActiveMission) {
  const point = getAgentLocation(agent);

  if (!point || !hasMissionOriginCoordinates(mission)) {
    return null;
  }

  return calculateDistanceKm(mission.origin_lat!, mission.origin_lng!, point.lat, point.lng);
}

function calculateDistanceKm(originLat: number, originLng: number, agentLat: number, agentLng: number) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(agentLat - originLat);
  const lngDelta = toRadians(agentLng - originLng);
  const originLatRad = toRadians(originLat);
  const agentLatRad = toRadians(agentLat);
  const haversine =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(originLatRad) *
      Math.cos(agentLatRad) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  const angle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusKm * angle;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function StateCard({
  title,
  body,
  tone = "default"
}: {
  title: string;
  body: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-10">
      <div
        className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border shadow-[0_0_24px_rgba(31,139,255,0.14)] ${
          tone === "error"
            ? "border-red-300/20 bg-red-400/10 text-red-200"
            : "border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan"
        }`}
      >
        <ShieldCheck aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black tracking-normal text-orbi-text">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted sm:text-base">
        {body}
      </p>
    </div>
  );
}
