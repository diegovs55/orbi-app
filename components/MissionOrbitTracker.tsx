"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Clock3, LocateFixed, PackageCheck, Radar, Route, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MissionPoint } from "@/components/MissionOrbitMap";
import {
  ActiveMission,
  canTransitionMission,
  getActiveMission,
  getMissionStatusLabel,
  isMissionActive,
  MissionStatus,
  missionProgressStatuses,
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
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingMessage, setRatingMessage] = useState("");
  const [showWaitingCancelConfirm, setShowWaitingCancelConfirm] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState("");

  useEffect(() => {
    return subscribeToMission(() => {
      const nextMission = getActiveMission();
      setMission(nextMission);
      if (nextMission?.last_updated_at) {
        setLastUpdated(new Date(nextMission.last_updated_at));
      }
    });
  }, []);

  function refreshAgentLocation() {
    if (!isMissionActive(mission)) {
      return;
    }

    const nextIndex = Math.min(trackIndex + 1, agentTrack.length - 1);

    setTrackIndex(nextIndex);
    const nextMission = updateActiveMission({
      selected_agent_lat: agentTrack[nextIndex].lat,
      selected_agent_lng: agentTrack[nextIndex].lng
    });
    setMission(nextMission);
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  function handleMissionStatusChange(status: MissionStatus) {
    if (!mission || !canTransitionMission(mission.status, status)) {
      return;
    }

    const nextMission = updateActiveMission({ status });
    setMission(nextMission);
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  function handleSaveRating() {
    if (!mission || mission.status !== "cumplida") {
      return;
    }

    const nextMission = updateActiveMission({
      rating,
      rating_comment: ratingComment,
      rated_agent_id: mission.active_agent_id || mission.selected_agent_id,
      rated_requester: mission.requester_name,
      rated_at: new Date().toISOString()
    });
    setMission(nextMission);
    setRatingMessage("Calificación guardada para el agente.");
  }

  function handleCancelWaitingMission() {
    const nextMission = updateActiveMission({ status: "cancelada" });
    setMission(nextMission);
    setWaitingMessage("Solicitud cancelada. No fue asignada a ningún agente.");
    setShowWaitingCancelConfirm(false);
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  const nextStatus = mission ? getNextMissionStatus(mission.status) : null;

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

  if (mission.status === "por_tomar" && !mission.selected_agent_id) {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Solicitud en espera" />
        <WaitingOrbitState
          message={waitingMessage}
          showCancelConfirm={showWaitingCancelConfirm}
          onWait={() => setWaitingMessage("Seguimos esperando disponibilidad compatible para esta solicitud.")}
          onCancel={() => setShowWaitingCancelConfirm(true)}
          onConfirmCancel={handleCancelWaitingMission}
          onKeepWaiting={() => setShowWaitingCancelConfirm(false)}
        />
      </section>
    );
  }

  if (mission.status === "por_tomar") {
    return (
      <MissionClosedState
        tone="waiting"
        title="Misión esperando agente"
        body="La solicitud ya está en Red Orbi. Cuando un agente la acepte, podrás seguirla aquí en órbita."
        primaryHref="/agentes"
        primaryLabel="Ver agentes"
      />
    );
  }

  if (mission.status === "cancelada" || mission.status === "archivada") {
    return (
      <MissionClosedState
        tone="cancelled"
        title="Misión cancelada"
        body="Esta misión fue cancelada y quedó archivada en historial. Puedes volver al inicio o crear una nueva misión."
        primaryHref="/pedir"
        primaryLabel="Pedir otra misión"
      />
    );
  }

  if (mission.status === "cumplida") {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Misión cumplida" />
        <MissionTimeline status={mission.status} />
        <RatingPanel
          comment={ratingComment}
          message={ratingMessage}
          rating={rating}
          savedRating={mission.rating ?? null}
          onCommentChange={setRatingComment}
          onRatingChange={setRating}
          onSave={handleSaveRating}
        />
        <Link
          href="/pedir"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] sm:w-auto"
        >
          Crear nueva misión
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <MissionSummary mission={mission} title="Misión activa" />
      <MissionTimeline status={mission.status} />

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
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {nextStatus ? (
            <button
              type="button"
              onClick={() => handleMissionStatusChange(nextStatus)}
              className="min-h-11 rounded-md bg-orbi-blue px-3 py-2 text-xs font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
            >
              Avanzar a {getMissionStatusLabel(nextStatus)}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleMissionStatusChange("cancelada")}
            className="min-h-11 rounded-md border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-400/15"
          >
            Cancelar misión
          </button>
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

    </section>
  );
}

function MissionSummary({ mission, title }: { mission: ActiveMission; title: string }) {
  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">{mission.service_type}</h2>
          <p className="mt-2 text-sm leading-6 text-orbi-muted">
            {mission.detail || "Misión activa"} en seguimiento por Red Orbi.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
          {getOrbitVisualStatusLabel(mission)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <MissionTile icon={PackageCheck} label="Servicio" value={mission.service_type} />
        <MissionTile icon={UserRound} label="Agente asignado" value={mission.selected_agent_name || "Pendiente de asignación"} />
        <MissionTile icon={UserRound} label="Usuario" value={mission.requester_name} />
        <MissionTile icon={Radar} label="Estado de misión" value={getOrbitVisualStatusLabel(mission)} />
        <MissionTile icon={Route} label="Origen" value={mission.origin_text} />
        <MissionTile icon={Route} label="Destino" value={mission.destination_text} />
        <MissionTile icon={Clock3} label="Órbita estimada" value={mission.estimated_orbit} />
        <MissionTile icon={ShieldCheck} label="Método de pago" value={mission.payment_method} />
        <MissionTile icon={ShieldCheck} label="Estado de pago" value={mission.payment_status} />
      </div>
    </article>
  );
}

function MissionTimeline({ status }: { status: MissionStatus }) {
  const currentIndex = missionProgressStatuses.indexOf(status);
  const isCancelled = status === "cancelada" || status === "archivada";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Progreso de misión
      </p>
      {isCancelled ? (
        <div className="mt-3 rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm font-bold text-red-100">
          Misión cancelada
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {missionProgressStatuses.map((state, index) => (
            <div
              key={state}
              className={`rounded-md border px-3 py-3 text-xs font-bold ${
                index <= currentIndex
                  ? "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan"
                  : "border-white/10 bg-white/[0.03] text-orbi-muted"
              }`}
            >
              {getMissionStatusLabel(state)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingPanel({
  rating,
  comment,
  savedRating,
  message,
  onRatingChange,
  onCommentChange,
  onSave
}: {
  rating: number;
  comment: string;
  savedRating: number | null;
  message: string;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Calificar misión
      </p>
      <h3 className="mt-1 text-lg font-black text-orbi-text">
        {savedRating ? `Calificación guardada: ${savedRating}/5` : "¿Cómo estuvo el agente?"}
      </h3>
      <div className="mt-4 flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onRatingChange(star)}
            className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-black ${
              star <= rating
                ? "border-orbi-cyan/40 bg-orbi-blue/20 text-orbi-cyan"
                : "border-white/10 bg-white/[0.04] text-orbi-muted"
            }`}
          >
            {star}
          </button>
        ))}
      </div>
      <textarea
        className="mt-4 min-h-24 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-orbi-text outline-none placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60"
        value={comment}
        onChange={(event) => onCommentChange(event.target.value)}
        placeholder="Comentario opcional sobre la misión"
      />
      {message ? (
        <p className="mt-3 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow sm:w-auto"
      >
        Guardar calificación
      </button>
    </section>
  );
}

function WaitingOrbitState({
  message,
  showCancelConfirm,
  onWait,
  onCancel,
  onConfirmCancel,
  onKeepWaiting
}: {
  message: string;
  showCancelConfirm: boolean;
  onWait: () => void;
  onCancel: () => void;
  onConfirmCancel: () => void;
  onKeepWaiting: () => void;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-8">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
        <Radar aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black text-orbi-text">Solicitud en espera</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-orbi-muted">
        No hay agentes compatibles disponibles en este momento. Tu solicitud aún no ha sido asignada.
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
          {message}
        </p>
      ) : null}
      {showCancelConfirm ? (
        <div className="mt-5 rounded-md border border-red-300/20 bg-red-400/10 p-4 text-left">
          <h3 className="font-black text-red-100">¿Deseas cancelar esta solicitud?</h3>
          <p className="mt-2 text-sm leading-6 text-red-100/85">
            No ha sido asignada a ningún agente y no existe ningún cobro pendiente.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onConfirmCancel}
              className="min-h-11 rounded-md border border-red-300/25 bg-red-400/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/20"
            >
              Sí, cancelar solicitud
            </button>
            <button
              type="button"
              onClick={onKeepWaiting}
              className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Seguir esperando
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onWait}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Esperar disponibilidad
          </button>
          <Link
            href="/pedir"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
          >
            Modificar solicitud
          </Link>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-red-300/20 bg-red-400/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
          >
            Cancelar solicitud
          </button>
        </div>
      )}
    </section>
  );
}

function MissionClosedState({
  title,
  body,
  primaryHref,
  primaryLabel,
  tone
}: {
  title: string;
  body: string;
  primaryHref: string;
  primaryLabel: string;
  tone: "waiting" | "cancelled";
}) {
  return (
    <section className={`rounded-md border p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-10 ${
      tone === "cancelled"
        ? "border-red-300/20 bg-red-400/10"
        : "border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82"
    }`}>
      <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border ${
        tone === "cancelled"
          ? "border-red-300/20 bg-red-400/10 text-red-100"
          : "border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan"
      }`}>
        <Radar aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black text-orbi-text">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted">{body}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href={primaryHref}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          {primaryLabel}
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
        >
          Volver a inicio
        </Link>
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

function getNextMissionStatus(status: MissionStatus) {
  if (status === "aceptada") {
    return "en_mision";
  }

  if (status === "en_mision") {
    return "cumplida";
  }

  return null;
}

function getOrbitVisualStatusLabel(mission: ActiveMission) {
  if (mission.status === "por_tomar" && !mission.selected_agent_id) {
    return "Pendiente de asignación";
  }

  if (mission.status === "por_tomar" || mission.status === "aceptada") {
    return "Asignada";
  }

  if (mission.status === "en_mision") {
    return "En curso";
  }

  if (mission.status === "cumplida") {
    return "Completada";
  }

  if (mission.status === "cancelada" || mission.status === "archivada") {
    return "Cancelada";
  }

  return getMissionStatusLabel(mission.status);
}

function getMissionPoint(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat === null || lng === null || lat === undefined || lng === undefined) {
    return fallbackPoint;
  }

  return { lat, lng };
}
