"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Clock3, PackageCheck, Radar, Route, ShieldCheck, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MissionPoint } from "@/components/MissionOrbitMap";
import {
  isCustomerRegistered,
  registerCustomerAccount,
  upsertGuestCustomerFromMission,
  getCurrentCustomerSession,
  saveCustomerSession,
} from "@/lib/customers";
import {
  ActiveMission,
  fetchActiveMissions,
  fetchMissionById,
  getMissionStatusLabel,
  isMissionClosed,
  MissionStatus,
  missionProgressStatuses,
} from "@/lib/missions";
import { getAgentById } from "@/lib/agents";
import { subscribeToTableChanges } from "@/lib/supabase";
import { CostBreakdown } from "@/components/CostBreakdown";
import { getAgentSession } from "@/lib/agentSession";
import { getBusinessSession } from "@/lib/businessSession";

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

export function MissionOrbitTracker({ initialMissionId }: { initialMissionId?: string } = {}) {
  const searchParams = useSearchParams();
  // All state is loaded after mount (client-only) to avoid hydration mismatches.
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialMissionId ?? searchParams.get("missionId")
  );
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingMessage, setRatingMessage] = useState("");
  const [waitingMessage, setWaitingMessage] = useState("");
  const [customerIsRegistered, setCustomerIsRegistered] = useState<boolean | null>(null);
  const [hideAccountInvite, setHideAccountInvite] = useState(false);
  const [showSaveSessionPrompt, setShowSaveSessionPrompt] = useState(false);
  const [lastClosedMission, setLastClosedMission] = useState<ActiveMission | null>(null);
  // Live agent position updated via agents Realtime subscription.
  const [liveAgentPoint, setLiveAgentPoint] = useState<MissionPoint | null>(null);
  const prevActiveMissionIdsRef = useRef<string[]>([]);
  const userClosedDetailRef = useRef(false);

  // Órbita solo muestra misiones con agente asignado (aceptada o en_mision).
  // Las misiones por_tomar sin agente siguen en Supabase para que otros agentes las vean.
  const activeMissions = missions.filter(
    (m) => !isMissionClosed(m) && (m.status === "esperando_negocio" || m.status === "preparando" || m.status === "por_tomar" || m.status === "aceptada" || m.status === "en_mision")
  );

  // The mission currently shown in the detail tracker. Source of truth: Supabase state only.
  // Without a known selectedId we show nothing — never expose another customer's mission.
  const mission = useMemo(() => {
    if (!selectedId) return null;
    // Search all fetched missions so cumplida state is visible after the mission closes.
    return missions.find((m) => m.id === selectedId) ?? null;
  }, [selectedId, missions]);

  // Ref para evitar stale closure de selectedId dentro del callback de Realtime
  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Restore missionId from sessionStorage when not provided via query string (SSR-safe).
  useEffect(() => {
    if (selectedId) return;
    const stored = sessionStorage.getItem("orbi_active_mission_id");
    if (stored) setSelectedId(stored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters the full mission list to only missions belonging to this user.
  // Matches by stored mission ID or by phone number (handles +52 prefix variants).
  function filterToUserMissions(all: ActiveMission[]): ActiveMission[] {
    const storedId = sessionStorage.getItem("orbi_active_mission_id");
    const customerPhone = getCurrentCustomerSession()?.phone?.replace(/\D/g, "") ?? "";
    return all.filter((m) => {
      if (storedId && m.id === storedId) return true;
      if (customerPhone) {
        const mp = (m.requester_phone ?? "").replace(/\D/g, "");
        return mp.endsWith(customerPhone) || customerPhone.endsWith(mp);
      }
      return false;
    });
  }

  // Checks whether the current viewer (customer / agent / business / admin) can see this mission.
  function hasPermission(m: ActiveMission): boolean {
    // Admin
    if (typeof window !== "undefined" &&
        window.sessionStorage.getItem("orbi_admin_unlocked") === "true") return true;
    // Agent
    const agentSession = getAgentSession();
    if (agentSession?.id && m.selected_agent_id === agentSession.id) return true;
    // Business
    const bizSession = getBusinessSession();
    if (bizSession?.supabaseBusinessId && m.business_id === bizSession.supabaseBusinessId) return true;
    // Customer — by stored mission ID or by phone
    const storedId = sessionStorage.getItem("orbi_active_mission_id");
    if (storedId && m.id === storedId) return true;
    const customerPhone = getCurrentCustomerSession()?.phone?.replace(/\D/g, "") ?? "";
    if (customerPhone) {
      const mp = (m.requester_phone ?? "").replace(/\D/g, "");
      if (mp.endsWith(customerPhone) || customerPhone.endsWith(mp)) return true;
    }
    return false;
  }

  // Carga inicial + re-fetch al cambiar selectedId (multi-misión)
  useEffect(() => {
    void (async () => {
      if (initialMissionId) {
        // Single-mission mode: load exactly one mission by ID.
        const m = await fetchMissionById(initialMissionId);
        if (m) setMissions([m]);
        return;
      }
      const all = filterToUserMissions(await fetchActiveMissions());
      setMissions(all);
      if (!selectedIdRef.current) {
        const primary = all.find((m) => !isMissionClosed(m)) ?? null;
        if (primary?.last_updated_at) {
          setLastUpdated(new Date(primary.last_updated_at));
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Suscripción estable — no se recrea por cambios de selectedId
  useEffect(() => {
    return subscribeToTableChanges("missions", async () => {
      if (initialMissionId) {
        const m = await fetchMissionById(initialMissionId);
        if (m) setMissions([m]);
        return;
      }
      const all = filterToUserMissions(await fetchActiveMissions());
      setMissions(all);
      if (!selectedIdRef.current) {
        const primary = all.find((m) => !isMissionClosed(m)) ?? null;
        if (primary?.last_updated_at) {
          setLastUpdated(new Date(primary.last_updated_at));
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live agent position: subscribe to agents table and refresh current_lat/lng
  // whenever any agent row changes. Re-runs when the assigned agent changes.
  const agentIdForMission = mission?.selected_agent_id ?? null;
  useEffect(() => {
    if (!agentIdForMission) {
      setLiveAgentPoint(null);
      return;
    }
    // Load initial live position.
    void getAgentById(agentIdForMission).then((a) => {
      if (!a) return;
      const lat = a.currentLat ?? a.lat;
      const lng = a.currentLng ?? a.lng;
      if (lat != null && lng != null) setLiveAgentPoint({ lat, lng });
    });
    // Subscribe to any change in agents table, then refresh this agent's row.
    return subscribeToTableChanges("agents", async () => {
      const a = await getAgentById(agentIdForMission);
      if (!a) return;
      const lat = a.currentLat ?? a.lat;
      const lng = a.currentLng ?? a.lng;
      if (lat != null && lng != null) setLiveAgentPoint({ lat, lng });
    });
  }, [agentIdForMission]);

  useEffect(() => {
    if (mission?.last_updated_at) {
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
      // Fetch disappeared missions from Supabase to check if any completed.
      void (async () => {
        for (const id of disappeared) {
          const found = await fetchMissionById(id);
          if (found?.status === "cumplida") {
            setLastClosedMission(found);
            setShowSaveSessionPrompt(!getCurrentCustomerSession());
            break;
          }
        }
      })();
    }
    prevActiveMissionIdsRef.current = currentIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissions.length]);

  useEffect(() => {
    if (mission?.status === "cumplida" && !getCurrentCustomerSession()) {
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

  function handleSaveRating() {
    if (!mission || mission.status !== "cumplida") return;
    // Rating columns don't exist in public.missions yet — persisted locally only for now.
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

  // ── Multi-mission overview (shown when >1 active mission exists) ──────────
  if (activeMissions.length > 1) {
    return (
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Tus pedidos activos
            </p>
            <h2 className="mt-1 text-2xl font-black text-orbi-text">
              {activeMissions.length} pedidos en curso
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
              lastUpdated={lastUpdated}
              liveAgentPoint={liveAgentPoint}
              waitingMessage={waitingMessage}
              rating={rating}
              ratingComment={ratingComment}
              ratingMessage={ratingMessage}
              customerIsRegistered={customerIsRegistered}
              hideAccountInvite={hideAccountInvite}
              onWait={() => setWaitingMessage("Seguimos esperando disponibilidad compatible para esta solicitud.")}
              onRatingChange={setRating}
              onCommentChange={setRatingComment}
              onSaveRating={handleSaveRating}
              onLaterInvite={() => setHideAccountInvite(true)}
              onRegister={handleRegisterCustomer}
              showSaveSessionPrompt={showSaveSessionPrompt}
              onSaveSession={(name, phone, email) => { saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
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
    return (
      <section className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Pedido completado
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
          lastUpdated={lastUpdated}
          liveAgentPoint={null}
          waitingMessage={waitingMessage}
          rating={rating}
          ratingComment={ratingComment}
          ratingMessage={ratingMessage}
          customerIsRegistered={customerIsRegistered}
          hideAccountInvite={hideAccountInvite}
          onWait={() => undefined}
          onRatingChange={setRating}
          onCommentChange={setRatingComment}
          onSaveRating={handleSaveRating}
          onLaterInvite={() => setHideAccountInvite(true)}
          onRegister={handleRegisterCustomer}
          showSaveSessionPrompt={showSaveSessionPrompt}
          onSaveSession={(name, phone, email) => { saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
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

  // Single-mission mode: permission check once the mission loaded.
  if (initialMissionId && mission && !hasPermission(mission)) {
    return (
      <section className="rounded-md border border-red-500/20 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center sm:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 text-red-400">
          <ShieldCheck aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-orbi-text">Sin acceso</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted">
          Esta misión no pertenece a tu cuenta.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Ir al inicio
        </Link>
      </section>
    );
  }

  if (!mission) {
    return (
      <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
          <Radar aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-orbi-text">No tienes pedidos activos</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted">
          Cuando hagas un pedido, podrás ver aquí su avance en tiempo real.
        </p>
        <Link
          href="/pedir"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Hacer un pedido
        </Link>
      </section>
    );
  }

  return (
    <MissionDetailBody
      mission={mission}
      lastUpdated={lastUpdated}
      liveAgentPoint={liveAgentPoint}
      waitingMessage={waitingMessage}
      rating={rating}
      ratingComment={ratingComment}
      ratingMessage={ratingMessage}
      customerIsRegistered={customerIsRegistered}
      hideAccountInvite={hideAccountInvite}
      onWait={() => setWaitingMessage("Seguimos esperando disponibilidad compatible para esta solicitud.")}
      onRatingChange={setRating}
      onCommentChange={setRatingComment}
      onSaveRating={handleSaveRating}
      onLaterInvite={() => setHideAccountInvite(true)}
      onRegister={handleRegisterCustomer}
      showSaveSessionPrompt={showSaveSessionPrompt}
      onSaveSession={(name, phone, email) => { saveCustomerSession(name, phone, email); setShowSaveSessionPrompt(false); }}
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
  lastUpdated: Date;
  liveAgentPoint: MissionPoint | null;
  waitingMessage: string;
  rating: number;
  ratingComment: string;
  ratingMessage: string;
  customerIsRegistered: boolean | null;
  hideAccountInvite: boolean;
  onWait: () => void;
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
  liveAgentPoint,
  waitingMessage,
  rating,
  ratingComment,
  ratingMessage,
  customerIsRegistered,
  hideAccountInvite,
  onWait,
  onRatingChange,
  onCommentChange,
  onSaveRating,
  onLaterInvite,
  onRegister,
  showSaveSessionPrompt,
  onSaveSession,
  onDismissSaveSession
}: MissionDetailBodyProps) {
  if (mission.status === "esperando_negocio") {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Tu pedido" />
        <article className="rounded-md border border-amber-400/20 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10 shadow-[0_0_28px_rgba(251,191,36,0.15)]">
              <Clock3 aria-hidden="true" className="h-8 w-8 animate-pulse text-amber-300" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Pedido recibido</p>
              <h2 className="mt-2 text-2xl font-black text-orbi-text">Ya recibimos tu pedido</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-orbi-muted">
                El negocio está revisando tu pedido. En cuanto lo confirme, empezamos.
              </p>
            </div>
          </div>
        </article>
      </section>
    );
  }

  if (mission.status === "preparando") {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Tu pedido" />
        <article className="rounded-md border border-emerald-400/20 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center sm:gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10 shadow-[0_0_28px_rgba(52,211,153,0.15)]">
              <Clock3 aria-hidden="true" className="h-8 w-8 animate-pulse text-emerald-300" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">En preparación</p>
              <h2 className="mt-2 text-2xl font-black text-orbi-text">Ya comenzaron a preparar tu pedido</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-orbi-muted">
                El agente saldrá a recogerlo en cuanto esté listo.
              </p>
            </div>
            {mission.selected_agent_name ? (
              <div className="mt-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Quien viene por ti</p>
                <p className="mt-1 font-black text-orbi-text">{mission.selected_agent_name}</p>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    );
  }

  if (mission.status === "por_tomar" && !mission.selected_agent_id) {
    return (
      <section className="space-y-5">
        <MissionSummary mission={mission} title="Tu pedido" />
        <WaitingOrbitState
          message={waitingMessage}
          onWait={onWait}
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
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">Conectando con el agente</p>
              <h2 className="mt-2 text-2xl font-black text-orbi-text">Ya encontramos quién te ayudará</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-orbi-muted">
                El agente está confirmando que puede atenderte. Avisamos cuando empiece.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-white/[0.07] pt-5 text-sm sm:grid-cols-2">
            {mission.selected_agent_name ? (
              <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Quien viene por ti</p>
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
              <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">Qué pediste</p>
              <p className="mt-1 font-black text-orbi-text">{mission.service_type}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-orbi-muted">A dónde va</p>
              <p className="mt-1 font-black text-orbi-text">{mission.destination_text}</p>
            </div>
          </div>
        </article>
      </section>
    );
  }

  if (mission.status === "cancelada" || mission.status === "archivada") {
    return (
      <MissionClosedState
        tone="cancelled"
        title="Este pedido fue cancelado"
        body="Si necesitas algo más, puedes hacer un nuevo pedido cuando quieras."
        primaryHref="/pedir"
        primaryLabel="Hacer un pedido"
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
          title="Todo listo"
          body="Tu pedido fue completado. Gracias por confiar en ORBI."
          primaryHref="/pedir"
          primaryLabel="Hacer otro pedido"
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
  const activeTitle = mission.status === "en_mision"
    ? "Tu pedido ya va en camino"
    : "Ya encontramos quién te ayudará";
  return (
    <section className="space-y-5">
      <MissionSummary mission={mission} title={activeTitle} />
      <MissionTimeline status={mission.status} />
      <article className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-orbi-panel/80 shadow-[0_18px_55px_rgba(0,0,0,0.32),0_0_28px_rgba(31,139,255,0.1)]">
        <div className="border-b border-white/10 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-orbi-cyan">Ubicación en vivo</p>
          <h2 className="mt-1 text-xl font-black text-orbi-text">Tu pedido en tiempo real</h2>
        </div>
        <div className="h-[58vh] min-h-[330px] w-full">
          <MissionOrbitMap
            origin={getMissionPoint(mission.origin_lat, mission.origin_lng)}
            destination={getMissionPoint(mission.destination_lat, mission.destination_lng)}
            agent={liveAgentPoint ?? getMissionPoint(mission.selected_agent_lat, mission.selected_agent_lng)}
            routeGeometry={mission.route_geometry ?? null}
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
            La posición del agente se actualiza desde la Red Orbi.
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
            {mission.detail || mission.service_type} — lo estamos cuidando.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
          {getOrbitVisualStatusLabel(mission)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <MissionTile icon={PackageCheck} label="Qué pediste" value={mission.service_type} />
        <MissionTile icon={UserRound} label="Quien viene por ti" value={mission.selected_agent_name || "Buscando agente"} />
        <MissionTile icon={UserRound} label="Para quién" value={mission.requester_name} />
        <MissionTile icon={Radar} label="Cómo va" value={getOrbitVisualStatusLabel(mission)} />
        <MissionTile icon={Route} label="Sale de" value={mission.origin_text} />
        <MissionTile icon={Route} label="Va a" value={mission.destination_text} />
        <MissionTile icon={Clock3} label="Tiempo estimado" value={mission.estimated_orbit} />
        <MissionTile icon={ShieldCheck} label="Cómo pagas" value={mission.payment_method} />
        <MissionTile icon={ShieldCheck} label="Cuándo pagas" value={mission.payment_status} />
      </div>
      {(mission.total_amount ?? 0) > 0 ? (
        <div className="mt-3">
          <CostBreakdown
            subtotal={mission.subtotal_productos ?? null}
            serviceFee={mission.service_fee ?? null}
            total={mission.total_amount ?? 0}
          />
        </div>
      ) : null}
    </article>
  );
}

const customerTimelineLabels: Record<string, string> = {
  por_tomar: "Agente listo",
  aceptada: "Confirmado",
  en_mision: "En camino",
  cumplida: "Listo",
};

function MissionTimeline({ status }: { status: MissionStatus }) {
  const currentIndex = missionProgressStatuses.indexOf(status);
  const isCancelled = status === "cancelada" || status === "archivada";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
        Cómo va tu pedido
      </p>
      {isCancelled ? (
        <div className="mt-3 rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm font-bold text-red-100">
          Este pedido fue cancelado
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
              {customerTimelineLabels[state] ?? state}
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
  onWait,
}: {
  message: string;
  onWait: () => void;
}) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-8">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
        <Radar aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black text-orbi-text">Buscando a alguien para ti</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-orbi-muted">
        Estamos buscando el agente más cercano. Tu pedido sigue activo — esto puede tomar unos minutos.
      </p>
      {message ? (
        <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
          {message}
        </p>
      ) : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onWait}
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Seguir esperando
        </button>
        <Link
          href="/pedir"
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
        >
          Cambiar mi pedido
        </Link>
      </div>
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

function getOrbitVisualStatusLabel(mission: ActiveMission) {
  if (mission.status === "esperando_negocio") return "Pedido recibido";
  if (mission.status === "preparando") return "Preparando";
  if (mission.status === "por_tomar" && !mission.selected_agent_id) return "Buscando agente";
  if (mission.status === "por_tomar") return "Agente confirmado";
  if (mission.status === "aceptada") return "Agente confirmado";
  if (mission.status === "en_mision") return "En camino";
  if (mission.status === "cumplida") return "Completado";
  if (mission.status === "cancelada" || mission.status === "archivada") return "Cancelado";
  return mission.status;
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
