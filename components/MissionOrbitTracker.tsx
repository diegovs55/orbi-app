"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Clock3, LocateFixed, PackageCheck, Radar, Route, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MissionPoint } from "@/components/MissionOrbitMap";
import {
  isCustomerRegistered,
  registerCustomerAccount,
  upsertGuestCustomerFromMission,
  getCurrentCustomerSession,
  saveCustomerSession,
  saveLocalCustomerAccount
} from "@/lib/customers";
import {
  ActiveMission,
  canTransitionMission,
  getActiveMission,
  getActiveMissions,
  getMissionHistory,
  getMissionStatusLabel,
  isMissionActive,
  isMissionClosed,
  migrateActiveMission,
  MissionStatus,
  missionProgressStatuses,
  subscribeToMission,
  updateActiveMissionById
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
  // All state is loaded after mount (client-only) to avoid hydration mismatches.
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingMessage, setRatingMessage] = useState("");
  const [showWaitingCancelConfirm, setShowWaitingCancelConfirm] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState("");
  const [customerIsRegistered, setCustomerIsRegistered] = useState<boolean | null>(null);
  const [hideAccountInvite, setHideAccountInvite] = useState(false);
  const [showSaveSessionPrompt, setShowSaveSessionPrompt] = useState(false);
  const [lastClosedMission, setLastClosedMission] = useState<ActiveMission | null>(null);
  const prevActiveMissionIdsRef = useRef<string[]>([]);
  const userClosedDetailRef = useRef(false);

  const activeMissions = missions.filter((m) => !isMissionClosed(m));

  // The mission currently shown in the detail tracker.
  const mission = useMemo(() => {
    if (selectedId) {
      return activeMissions.find((m) => m.id === selectedId) ?? activeMissions[0] ?? null;
    }
    return getActiveMission();
  }, [selectedId, activeMissions]);

  useEffect(() => {
    migrateActiveMission();
    const load = () => {
      const all = getActiveMissions();
      setMissions(all);
      if (!selectedId) {
        const primary = getActiveMission();
        if (primary?.last_updated_at) {
          setLastUpdated(new Date(primary.last_updated_at));
        }
      }
    };
    load();
    return subscribeToMission(load);
  }, [selectedId]);

  useEffect(() => {
    if (mission?.last_updated_at) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastUpdated(new Date(mission.last_updated_at));
    }
  }, [mission?.id, mission?.last_updated_at]);

  // Fix 3: auto-select first mission so map/detail always shows in multi-mission view.
  // Skips auto-select if the user explicitly closed the detail panel.
  useEffect(() => {
    if (activeMissions.length > 1 && !selectedId && !userClosedDetailRef.current) {
      setSelectedId(activeMissions[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissions.length, selectedId]);

  // Fix 4: capture last cumplida mission before it disappears from activeMissions.
  useEffect(() => {
    const currentIds = activeMissions.map((m) => m.id);
    const disappeared = prevActiveMissionIdsRef.current.filter(
      (id) => !currentIds.includes(id)
    );
    if (disappeared.length > 0) {
      const hist = getMissionHistory();
      for (const id of disappeared) {
        const found = hist.find((m) => m.id === id && m.status === "cumplida");
        if (found) {
          setLastClosedMission(found);
          setShowSaveSessionPrompt(!getCurrentCustomerSession());
          break;
        }
      }
    }
    prevActiveMissionIdsRef.current = currentIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissions.length]);

  useEffect(() => {
    if (mission?.status === "cumplida" && !getCurrentCustomerSession()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSaveSessionPrompt(true);
    }
  }, [mission?.status]);

  useEffect(() => {
    let isActive = true;

    if (!mission?.requester_phone) {
      return () => {
        isActive = false;
      };
    }

    isCustomerRegistered(mission.requester_phone).then((isRegistered) => {
      if (isActive) {
        setCustomerIsRegistered(isRegistered);
      }
    });

    return () => {
      isActive = false;
    };
  }, [mission?.requester_phone, mission?.user_id]);

  function refreshAgentLocation() {
    if (!mission || !isMissionActive(mission)) return;
    const nextIndex = Math.min(trackIndex + 1, agentTrack.length - 1);
    setTrackIndex(nextIndex);
    const nextMission = updateActiveMissionById(mission.id, {
      selected_agent_lat: agentTrack[nextIndex].lat,
      selected_agent_lng: agentTrack[nextIndex].lng
    });
    if (nextMission?.last_updated_at) {
      setLastUpdated(new Date(nextMission.last_updated_at));
    }
  }

  function handleMissionStatusChange(status: MissionStatus) {
    if (!mission || !canTransitionMission(mission.status, status)) return;
    updateActiveMissionById(mission.id, { status });
  }

  function handleSaveRating() {
    if (!mission || mission.status !== "cumplida") return;
    updateActiveMissionById(mission.id, {
      rating,
      rating_comment: ratingComment,
      rated_agent_id: mission.active_agent_id || mission.selected_agent_id,
      rated_requester: mission.requester_name,
      rated_at: new Date().toISOString()
    });
    setRatingMessage("Calificación guardada para el agente.");
  }

  async function handleRegisterCustomer({
    name,
    phone,
    email,
    password
  }: {
    name: string;
    phone: string;
    email: string;
    password: string;
  }) {
    if (!mission) return;
    await upsertGuestCustomerFromMission(mission);
    await registerCustomerAccount({ name, phone, email, password });
    setCustomerIsRegistered(true);
    setHideAccountInvite(true);
  }

  function handleCancelWaitingMission() {
    if (!mission) return;
    updateActiveMissionById(mission.id, { status: "cancelada" });
    setWaitingMessage("Solicitud cancelada. No fue asignada a ningún agente.");
    setShowWaitingCancelConfirm(false);
  }

  const nextStatus = mission ? getNextMissionStatus(mission.status) : null;

  // ── Multi-mission overview (shown when >1 active mission exists) ──────────
  if (activeMissions.length > 1) {
    return (
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Tus misiones activas
            </p>
            <h2 className="mt-1 text-2xl font-black text-orbi-text">
              {activeMissions.length} misiones en órbita
            </h2>
          </div>
          {/* Fix 5: always visible "Volver al inicio" */}
          <Link
            href="/"
            className="shrink-0 text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
          >
            Volver al inicio
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {activeMissions.map((m) => (
            <MissionSummaryCard
              key={m.id}
              mission={m}
              isSelected={selectedId === m.id}
              onSelect={() => { userClosedDetailRef.current = false; setSelectedId(m.id); }}
            />
          ))}
        </div>

        {/* Detail of selected mission */}
        {selectedId && mission ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-orbi-cyan">
                Detalle — {mission.service_type}
              </p>
              <button
                type="button"
                onClick={() => { userClosedDetailRef.current = true; setSelectedId(null); }}
                className="text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
              >
                Cerrar detalle
              </button>
            </div>
            <MissionDetailBody
              mission={mission}
              nextStatus={nextStatus}
              lastUpdated={lastUpdated}
              waitingMessage={waitingMessage}
              showWaitingCancelConfirm={showWaitingCancelConfirm}
              rating={rating}
              ratingComment={ratingComment}
              ratingMessage={ratingMessage}
              customerIsRegistered={customerIsRegistered}
              hideAccountInvite={hideAccountInvite}
              onRefreshLocation={refreshAgentLocation}
              onStatusChange={handleMissionStatusChange}
              onWait={() => setWaitingMessage("Seguimos esperando disponibilidad compatible para esta solicitud.")}
              onCancelConfirm={() => setShowWaitingCancelConfirm(true)}
              onConfirmCancel={handleCancelWaitingMission}
              onKeepWaiting={() => setShowWaitingCancelConfirm(false)}
              onRatingChange={setRating}
              onCommentChange={setRatingComment}
              onSaveRating={handleSaveRating}
              onLaterInvite={() => setHideAccountInvite(true)}
              onRegister={handleRegisterCustomer}
              showSaveSessionPrompt={showSaveSessionPrompt}
              onSaveSession={(name, phone, email, password) => { saveLocalCustomerAccount(name, phone, email, password); saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
              onDismissSaveSession={() => setShowSaveSessionPrompt(false)}
            />
          </div>
        ) : null}

        <div className="pt-1">
          <Link
            href="/pedir"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            + Nueva misión
          </Link>
        </div>
      </section>
    );
  }
  // ── End multi-mission overview ─────────────────────────────────────────────

  // Fix 4: show closure UX for last cumplida mission before transitioning to empty state.
  if (!mission && lastClosedMission) {
    const closedNextStatus = getNextMissionStatus(lastClosedMission.status);
    return (
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Misión cumplida
            </p>
            <h2 className="mt-1 text-2xl font-black text-orbi-text">
              {lastClosedMission.service_type}
            </h2>
          </div>
          <Link
            href="/"
            className="shrink-0 text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
          >
            Volver al inicio
          </Link>
        </div>
        <MissionDetailBody
          mission={lastClosedMission}
          nextStatus={closedNextStatus}
          lastUpdated={lastUpdated}
          waitingMessage={waitingMessage}
          showWaitingCancelConfirm={showWaitingCancelConfirm}
          rating={rating}
          ratingComment={ratingComment}
          ratingMessage={ratingMessage}
          customerIsRegistered={customerIsRegistered}
          hideAccountInvite={hideAccountInvite}
          onRefreshLocation={() => undefined}
          onStatusChange={() => undefined}
          onWait={() => undefined}
          onCancelConfirm={() => undefined}
          onConfirmCancel={() => undefined}
          onKeepWaiting={() => undefined}
          onRatingChange={setRating}
          onCommentChange={setRatingComment}
          onSaveRating={handleSaveRating}
          onLaterInvite={() => setHideAccountInvite(true)}
          onRegister={handleRegisterCustomer}
          showSaveSessionPrompt={showSaveSessionPrompt}
          onSaveSession={(name, phone, email, password) => { saveLocalCustomerAccount(name, phone, email, password); saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
          onDismissSaveSession={() => setShowSaveSessionPrompt(false)}
        />
        <div className="pt-1">
          <Link
            href="/pedir"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            + Nueva misión
          </Link>
        </div>
      </section>
    );
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
    <MissionDetailBody
      mission={mission}
      nextStatus={nextStatus}
      lastUpdated={lastUpdated}
      waitingMessage={waitingMessage}
      showWaitingCancelConfirm={showWaitingCancelConfirm}
      rating={rating}
      ratingComment={ratingComment}
      ratingMessage={ratingMessage}
      customerIsRegistered={customerIsRegistered}
      hideAccountInvite={hideAccountInvite}
      onRefreshLocation={refreshAgentLocation}
      onStatusChange={handleMissionStatusChange}
      onWait={() => setWaitingMessage("Seguimos esperando disponibilidad compatible para esta solicitud.")}
      onCancelConfirm={() => setShowWaitingCancelConfirm(true)}
      onConfirmCancel={handleCancelWaitingMission}
      onKeepWaiting={() => setShowWaitingCancelConfirm(false)}
      onRatingChange={setRating}
      onCommentChange={setRatingComment}
      onSaveRating={handleSaveRating}
      onLaterInvite={() => setHideAccountInvite(true)}
      onRegister={handleRegisterCustomer}
      showSaveSessionPrompt={showSaveSessionPrompt}
      onSaveSession={(name, phone, email, password) => { saveLocalCustomerAccount(name, phone, email, password); saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
      onDismissSaveSession={() => setShowSaveSessionPrompt(false)}
    />
  );
}

// ── MissionSummaryCard ────────────────────────────────────────────────────────

function MissionSummaryCard({
  mission,
  isSelected,
  onSelect
}: {
  mission: ActiveMission;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`rounded-md border p-4 transition ${
        isSelected
          ? "border-orbi-cyan/40 bg-orbi-blue/[0.12]"
          : "border-orbi-cyan/15 bg-white/[0.04] hover:border-orbi-cyan/30 hover:bg-orbi-blue/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-orbi-text">{mission.service_type}</p>
          <p className="mt-0.5 text-xs font-semibold text-orbi-cyan">{getOrbitVisualStatusLabel(mission)}</p>
        </div>
        {mission.total ? (
          <span className="shrink-0 text-sm font-black text-orbi-text">
            ${mission.total.toFixed(0)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-xs text-orbi-muted">
        {mission.selected_agent_name || "Sin agente asignado"}
      </p>
      <button
        type="button"
        onClick={onSelect}
        className="mt-3 w-full rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
      >
        {isSelected ? "Viendo detalle" : "Ver misión"}
      </button>
    </article>
  );
}

// ── MissionDetailBody ─────────────────────────────────────────────────────────
// Extracts the per-mission render logic so it can be used both in single-mission
// mode and as the expanded detail panel in multi-mission mode.

type MissionDetailBodyProps = {
  mission: ActiveMission;
  nextStatus: MissionStatus | null;
  lastUpdated: Date;
  waitingMessage: string;
  showWaitingCancelConfirm: boolean;
  rating: number;
  ratingComment: string;
  ratingMessage: string;
  customerIsRegistered: boolean | null;
  hideAccountInvite: boolean;
  onRefreshLocation: () => void;
  onStatusChange: (s: MissionStatus) => void;
  onWait: () => void;
  onCancelConfirm: () => void;
  onConfirmCancel: () => void;
  onKeepWaiting: () => void;
  onRatingChange: (r: number) => void;
  onCommentChange: (c: string) => void;
  onSaveRating: () => void;
  onLaterInvite: () => void;
  onRegister: (p: { name: string; phone: string; email: string; password: string }) => Promise<void>;
  showSaveSessionPrompt: boolean;
  onSaveSession: (name: string, phone: string, email: string, password: string) => void;
  onDismissSaveSession: () => void;
};

function MissionDetailBody({
  mission,
  lastUpdated,
  waitingMessage,
  showWaitingCancelConfirm,
  rating,
  ratingComment,
  ratingMessage,
  customerIsRegistered,
  hideAccountInvite,
  onRefreshLocation,
  onWait,
  onCancelConfirm,
  onConfirmCancel,
  onKeepWaiting,
  onRatingChange,
  onCommentChange,
  onSaveRating,
  onLaterInvite,
  onRegister,
  showSaveSessionPrompt,
  onSaveSession,
  onDismissSaveSession
}: MissionDetailBodyProps) {
  if (mission.status === "por_tomar" && !mission.selected_agent_id) {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Solicitud en espera" />
        <WaitingOrbitState
          message={waitingMessage}
          showCancelConfirm={showWaitingCancelConfirm}
          onWait={onWait}
          onCancel={onCancelConfirm}
          onConfirmCancel={onConfirmCancel}
          onKeepWaiting={onKeepWaiting}
        />
      </section>
    );
  }

  if (mission.status === "por_tomar") {
    return (
      <section className="space-y-5">
        <article className="rounded-md border border-orbi-cyan/20 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.14)] sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-orbi-cyan/25 bg-orbi-blue/15 shadow-[0_0_28px_rgba(54,215,255,0.18)]">
              <Radar aria-hidden="true" className="h-8 w-8 animate-pulse text-orbi-cyan" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">Misión en órbita</p>
              <h2 className="mt-2 text-2xl font-black text-orbi-text">Esperando aceptación del agente</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-orbi-muted">
                Estamos notificando al agente. Te avisaremos cuando acepte tu misión.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-white/[0.07] pt-5 text-sm sm:grid-cols-2">
            {mission.selected_agent_name ? (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Agente asignado</p>
                <p className="mt-1 font-black text-orbi-text">{mission.selected_agent_name}</p>
              </div>
            ) : null}
            {mission.estimated_orbit ? (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Tiempo estimado</p>
                <p className="mt-1 font-black text-orbi-text">{mission.estimated_orbit}</p>
              </div>
            ) : null}
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Servicio</p>
              <p className="mt-1 font-black text-orbi-text">{mission.service_type}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Destino</p>
              <p className="mt-1 font-black text-orbi-text">{mission.destination_text}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-center">
            <Link href="/pedir" className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10">
              Volver al inicio
            </Link>
          </div>
        </article>
      </section>
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
    const shouldShowRatingPanel = !hasMissionRating(mission);
    const shouldShowAccountInvite = customerIsRegistered === false && !hideAccountInvite;
    return (
      <section className="space-y-5">
        <MissionClosedState
          tone="waiting"
          title="Misión cumplida"
          body="Esta misión ya fue completada y quedó cerrada en Red Orbi."
          primaryHref="/pedir"
          primaryLabel="Crear nueva misión"
        />
        {shouldShowRatingPanel ? (
          <RatingPanel
            comment={ratingComment}
            message={ratingMessage}
            rating={rating}
            savedRating={mission.rating ?? null}
            onCommentChange={onCommentChange}
            onRatingChange={onRatingChange}
            onSave={onSaveRating}
          />
        ) : null}
        {showSaveSessionPrompt ? (
          <SaveSessionCard
            name={mission.requester_name}
            phone={mission.requester_phone}
            onSave={onSaveSession}
            onDismiss={onDismissSaveSession}
          />
        ) : null}
        {shouldShowAccountInvite ? (
          <CreateAccountInvite
            mission={mission}
            onLater={onLaterInvite}
            onRegister={onRegister}
          />
        ) : null}
      </section>
    );
  }

  // aceptada | en_mision
  return (
    <section className="space-y-5">
      <MissionSummary mission={mission} title="Misión activa" />
      <MissionTimeline status={mission.status} />
      <article className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-orbi-panel/80 shadow-[0_18px_55px_rgba(0,0,0,0.32),0_0_28px_rgba(31,139,255,0.1)]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-orbi-cyan">Ubicación en vivo</p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">Ver la misión en órbita</h2>
          </div>
          <button
            type="button"
            onClick={onRefreshLocation}
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">Última actualización</p>
            <p className="mt-1 text-sm font-semibold text-orbi-text">
              {lastUpdated.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
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

function CreateAccountInvite({
  mission,
  onLater,
  onRegister
}: {
  mission: ActiveMission;
  onLater: () => void;
  onRegister: (input: { name: string; phone: string; email: string; password: string }) => Promise<void>;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [name, setName] = useState(mission.requester_name);
  const [phone, setPhone] = useState(mission.requester_phone);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!name.trim() || !phone.trim() || !email.trim() || !password) {
      setMessage("Completa nombre, teléfono, correo y contraseña.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setIsSaving(true);

    try {
      await onRegister({ name, phone, email, password });
      setMessage("Cuenta creada. Tu historial quedó guardado en Orbi.");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "No fue posible crear la cuenta.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Guarda tu historial en Orbi
      </p>
      <h3 className="mt-1 text-lg font-black text-orbi-text">
        ¿Quieres guardar tu historial, direcciones favoritas y futuras misiones?
      </h3>
      <p className="mt-2 text-sm leading-6 text-orbi-muted">
        Crea tu cuenta para consultar tus misiones anteriores, guardar tus datos y agilizar tus próximos pedidos.
      </p>
      {!isFormOpen ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="min-h-11 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow"
          >
            Crear mi cuenta
          </button>
          <button
            type="button"
            onClick={onLater}
            className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
          >
            Más tarde
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <AccountInput label="Nombre" value={name} onChange={setName} />
          <AccountInput label="Teléfono" value={phone} onChange={setPhone} />
          <AccountInput label="Correo electrónico" value={email} onChange={setEmail} type="email" />
          <AccountInput label="Contraseña" value={password} onChange={setPassword} type="password" />
          <AccountInput
            label="Confirmar contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
            type="password"
          />
          {message ? (
            <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3 text-sm font-bold text-orbi-cyan sm:col-span-2">
              {message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSaving}
            className="min-h-11 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow disabled:opacity-60 sm:col-span-2"
          >
            {isSaving ? "Creando cuenta..." : "Crear mi cuenta"}
          </button>
        </form>
      )}
    </section>
  );
}

function AccountInput({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60"
        required
      />
    </label>
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

function SaveSessionCard({
  name,
  phone,
  onSave,
  onDismiss
}: {
  name: string;
  phone: string;
  onSave: (name: string, phone: string, email: string, password: string) => void;
  onDismiss: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState(name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const displayPhone = phone.replace(/\D/g, "").replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError("");
    onSave(fullName.trim(), phone, email.trim(), password);
  }

  if (!showForm) {
    return (
      <article className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
        <p className="text-sm font-bold text-orbi-text">¿Te reconocemos la próxima vez?</p>
        <p className="mt-1 text-xs text-orbi-muted">
          Crea tu cuenta Orbi para autocompletar tus datos y ver tu historial de misiones.
        </p>
        <p className="mt-2 rounded-md border border-orbi-cyan/15 bg-orbi-black/40 px-3 py-2 font-mono text-sm font-bold text-orbi-cyan">
          {displayPhone || phone}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0]"
          >
            Sí, crear mi cuenta
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
          >
            No, gracias
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.07] p-4">
      <p className="text-sm font-bold text-orbi-text">Crear cuenta Orbi</p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3" noValidate>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Nombre completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Tu nombre completo"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="correo@ejemplo.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">WhatsApp</label>
          <p className="mt-1 rounded-md border border-white/10 bg-orbi-black/40 px-3 py-2 font-mono text-sm font-bold text-orbi-cyan">
            {displayPhone || phone}
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Repite la contraseña"
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0]"
          >
            Crear cuenta
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="inline-flex items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </form>
    </article>
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

function hasMissionRating(mission: ActiveMission) {
  return typeof mission.rating === "number" && mission.rating >= 1 && mission.rating <= 5;
}

function getMissionPoint(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat === null || lng === null || lat === undefined || lng === undefined) {
    return fallbackPoint;
  }

  return { lat, lng };
}
