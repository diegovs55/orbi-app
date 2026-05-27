"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Clock3, LocateFixed, PackageCheck, Radar, Route, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MissionPoint } from "@/components/MissionOrbitMap";
import {
  ActiveMission,
  getActiveMission,
  missionStatuses,
  subscribeToMission,
  updateActiveMission
} from "@/lib/missions";

const MissionOrbitMap = dynamic(
  () => import("@/components/MissionOrbitMap").then((mod) => mod.MissionOrbitMap),
  {
    loading: () => (
      <div className="flex h-full min-h-[330px] items-center justify-center bg-orbi-black text-sm font-semibold text-orbi-muted">
        Cargando órbita...
      </div>
    ),
    ssr: false
  }
);

const fallbackPoint: MissionPoint = { lat: 18.8349, lng: -99.5818 };

const agentTrack: MissionPoint[] = [
  { lat: 18.8316, lng: -99.5796 },
  { lat: 18.8331, lng: -99.5806 },
  { lat: 18.8347, lng: -99.5815 },
  { lat: 18.8309, lng: -99.5791 },
  { lat: 18.8268, lng: -99.5768 },
  { lat: 18.8248, lng: -99.5744 }
];

export function MissionOrbitTracker() {
  const [mission, setMission] = useState<ActiveMission | null>(() => getActiveMission());
  const [trackIndex, setTrackIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => {
    const currentMission = getActiveMission();
    return currentMission?.last_updated_at ? new Date(currentMission.last_updated_at) : new Date();
  });

  useEffect(() => {
    return subscribeToMission(() => {
      const nextMission = getActiveMission();
      setMission(nextMission);
      if (nextMission?.last_updated_at) {
        setLastUpdated(new Date(nextMission.last_updated_at));
      }
    });
  }, []);

  const currentStateIndex = useMemo(() => {
    if (!mission) {
      return -1;
    }

    return missionStatuses.indexOf(mission.mission_status);
  }, [mission]);

  function refreshAgentLocation() {
    if (!mission) {
      return;
    }

    const nextIndex = Math.min(trackIndex + 1, agentTrack.length - 1);
    const nextStatus = getMissionStateFromTrack(nextIndex);

    setTrackIndex(nextIndex);
    const nextMission = updateActiveMission({
      selected_agent_lat: agentTrack[nextIndex].lat,
      selected_agent_lng: agentTrack[nextIndex].lng,
      mission_status: nextStatus
    });
    setMission(nextMission);
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  function handleMissionStatusChange(status: ActiveMission["mission_status"]) {
    if (!mission) {
      return;
    }

    const nextMission = updateActiveMission({ mission_status: status });
    setMission(nextMission);
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  if (!mission) {
    return (
      <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
          <Radar aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-orbi-text">No hay misión activa en órbita</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted">
          Cuando una misión sea enviada y aceptada, podrás seguir aquí su avance operativo.
        </p>
        <Link
          href="/pedir"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Crear nueva misión
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <article className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Misión activa
            </p>
            <h2 className="mt-2 text-2xl font-black text-orbi-text">{mission.service_type}</h2>
            <p className="mt-2 text-sm leading-6 text-orbi-muted">
              {mission.detail || "Misión activa"} en seguimiento por Red Orbi.
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
            {mission.mission_status}
          </span>
        </div>

        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <MissionTile icon={PackageCheck} label="Servicio" value={mission.service_type} />
          <MissionTile icon={UserRound} label="Agente asignado" value={mission.selected_agent_name} />
          <MissionTile icon={UserRound} label="Usuario" value={mission.requester_name} />
          <MissionTile icon={Radar} label="Estado de misión" value={mission.mission_status} />
          <MissionTile icon={Route} label="Origen" value={mission.origin_text} />
          <MissionTile icon={Route} label="Destino" value={mission.destination_text} />
          <MissionTile icon={Clock3} label="Órbita estimada" value={mission.estimated_orbit} />
          <MissionTile icon={ShieldCheck} label="Método de pago" value={mission.payment_method} />
          <MissionTile icon={ShieldCheck} label="Estado de pago" value={mission.payment_status} />
        </div>
      </article>

      <article className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Control del agente
            </p>
            <h3 className="mt-1 text-lg font-black text-orbi-text">Avanzar misión</h3>
          </div>
          {mission.accepted_at ? (
            <p className="text-xs font-semibold text-orbi-muted">
              Aceptada:{" "}
              {new Date(mission.accepted_at).toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short"
              })}
            </p>
          ) : null}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {(["Misión aceptada", "En misión", "Misión cumplida", "Cancelar misión"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => handleMissionStatusChange(status)}
                className={`min-h-11 rounded-md border px-3 py-2 text-xs font-bold transition ${
                  mission.mission_status === status
                    ? "border-orbi-cyan/45 bg-orbi-blue/20 text-orbi-cyan"
                    : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
                }`}
              >
                {status}
              </button>
            )
          )}
        </div>
      </article>

      <article className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-orbi-panel/80 shadow-[0_18px_55px_rgba(0,0,0,0.32),0_0_28px_rgba(31,139,255,0.1)]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orbi-cyan">
              Ubicación en vivo
            </p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">Ver la misión en órbita</h2>
          </div>
          <button
            type="button"
            onClick={refreshAgentLocation}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
          >
            <LocateFixed aria-hidden="true" className="h-4 w-4" />
            Actualizar ubicación
          </button>
        </div>
        <div className="h-[58vh] min-h-[330px] w-full">
          <MissionOrbitMap
            origin={getMissionPoint(mission.origin_lat, mission.origin_lng)}
            destination={getMissionPoint(mission.destination_lat, mission.destination_lng)}
            agent={getMissionPoint(mission.selected_agent_lat, mission.selected_agent_lng)}
          />
        </div>
      </article>

      <article className="rounded-md border border-white/10 bg-white/[0.04] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Última actualización
            </p>
            <p className="mt-1 text-sm font-semibold text-orbi-text">
              {lastUpdated.toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short"
              })}
            </p>
          </div>
          <p className="text-sm leading-6 text-orbi-muted">
            Usando última ubicación conocida del agente. En la siguiente versión se conectará a rastreo en tiempo real.
          </p>
        </div>
      </article>

      <div className="grid gap-2">
        {missionStatuses.map((state, index) => (
          <div
            key={state}
            className={`rounded-md border px-4 py-3 text-sm font-bold ${
              index <= currentStateIndex
                ? "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan"
                : "border-white/10 bg-white/[0.03] text-orbi-muted"
            }`}
          >
            {state}
          </div>
        ))}
      </div>
    </section>
  );
}

function MissionTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Radar;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-2 text-orbi-cyan">
        <Icon aria-hidden="true" className="h-4 w-4" />
        <p className="text-xs font-bold uppercase tracking-[0.14em]">{label}</p>
      </div>
      <p className="mt-2 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function getMissionStateFromTrack(index: number): ActiveMission["mission_status"] {
  if (index <= 0) {
    return "Misión aceptada";
  }

  if (index === 1) {
    return "Misión aceptada";
  }

  if (index <= 3) {
    return "En misión";
  }

  return "Misión cumplida";
}

function getMissionPoint(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat === null || lng === null || lat === undefined || lng === undefined) {
    return fallbackPoint;
  }

  return { lat, lng };
}
