"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import {
  getAgentLocation,
  getAgentOperationalLabel,
  getAgents,
  OrbiAgent
} from "@/lib/agents";
import { getMissionHistory } from "@/lib/missions";
import { subscribeToAgents } from "@/lib/supabase";

const operationalLabelStyles: Record<string, string> = {
  "En órbita": "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  "Fuera de horario": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-red-300/15 bg-red-400/10 text-red-200",
  "Fuera de zona": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de órbita": "border-white/10 bg-white/[0.04] text-orbi-muted"
};

/** Public read-only catalog of agents — no mission controls. */
export function AgentCards() {
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [availabilityRefreshAt, setAvailabilityRefreshAt] = useState(() => new Date());
  const [profileAgent, setProfileAgent] = useState<OrbiAgent | null>(null);

  const refreshAgents = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const next = await getAgents();
      setAgents(next);
      setAvailabilityRefreshAt(new Date());
      setError("");
    } catch (err) {
      setAgents([]);
      setError(err instanceof Error ? err.message : "No fue posible cargar los agentes Orbi.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live) return;
      setError("La consulta tardó demasiado. Revisa la conexión con Supabase.");
      setIsLoading(false);
    }, 8000);

    getAgents()
      .then((next) => {
        if (!live) return;
        window.clearTimeout(timer);
        setAgents(next);
        setAvailabilityRefreshAt(new Date());
      })
      .catch((err: unknown) => {
        if (!live) return;
        window.clearTimeout(timer);
        setError(err instanceof Error ? err.message : "No fue posible cargar los agentes Orbi.");
      })
      .finally(() => {
        if (live) {
          window.clearTimeout(timer);
          setIsLoading(false);
        }
      });

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onFocus = () => void refreshAgents({ silent: true });
    const onVisibility = () => { if (document.visibilityState === "visible") void refreshAgents({ silent: true }); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAgents]);

  useEffect(() => {
    return subscribeToAgents(() => void refreshAgents({ silent: true }));
  }, [refreshAgents]);

  const sortedAgents = useMemo(() => [...agents].sort((a, b) => a.name.localeCompare(b.name)), [agents]);

  if (isLoading) {
    return <StateCard title="Cargando agentes Orbi..." body="Estamos consultando la red activa." />;
  }

  if (error) {
    return <StateCard title="No pudimos cargar los agentes." body={error} tone="error" />;
  }

  if (!sortedAgents.length) {
    return (
      <StateCard
        title="Aún no hay agentes Orbi registrados."
        body="Pronto podrás ver aquí perfiles verificados para recibir apoyo local."
      />
    );
  }

  return (
    <>
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
          const ratingStats = getAgentRatingStats(agent.id);
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
                        operationalLabelStyles[operationalLabel] ??
                        "border-white/10 bg-white/5 text-orbi-muted"
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
                <InfoTile
                  label="Calificación"
                  value={
                    ratingStats.count
                      ? `★ ${ratingStats.average.toFixed(1)} · ${ratingStats.count} misión${ratingStats.count > 1 ? "es" : ""}`
                      : "Sin calificaciones"
                  }
                />
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

      {profileAgent ? <ProfileModal agent={profileAgent} onClose={() => setProfileAgent(null)} /> : null}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProfileModal({ agent, onClose }: { agent: OrbiAgent; onClose: () => void }) {
  const ratingStats = getAgentRatingStats(agent.id);
  const location = getAgentLocation(agent);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-md border border-orbi-cyan/20 bg-orbi-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <AgentAvatar agent={agent} />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">Perfil de confianza</p>
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
          <InfoTile label="Servicios" value={agent.serviceType} />
          <InfoTile label="Radio operativo" value={`${agent.radiusKm || 20} km`} />
          <InfoTile
            label="Rating promedio"
            value={ratingStats.count ? `${ratingStats.average.toFixed(1)} / 5` : "Sin calificaciones"}
          />
          <InfoTile label="Misiones calificadas" value={String(ratingStats.count)} />
          <InfoTile
            label="Ubicación operativa"
            value={location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : "Sin ubicación registrada"}
          />
        </div>
      </section>
    </div>
  );
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

function StateCard({ title, body, tone = "default" }: { title: string; body: string; tone?: "default" | "error" }) {
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
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted sm:text-base">{body}</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAgentRatingStats(agentId: string) {
  const ratings = getMissionHistory()
    .filter(
      (m) =>
        m.status === "cumplida" &&
        (m.rated_agent_id || m.active_agent_id || m.selected_agent_id) === agentId
    )
    .map((m) => m.rating)
    .filter((r): r is number => typeof r === "number" && r >= 1 && r <= 5);
  return {
    count: ratings.length,
    average: ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0
  };
}
