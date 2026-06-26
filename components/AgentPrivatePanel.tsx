"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  LocateFixed,
  Navigation,
  Orbit,
  PackageCheck,
  RefreshCw,
  UserRound,
  XCircle
} from "lucide-react";
import {
  AGENT_STATUS,
  AgentServiceType,
  OrbiAgent,
  agentServiceTypes,
  getAgentById,
  getAgentCurrentLocation,
  getAgentInitials,
  getAgentOperatingEligibility,
  getAgentOperationalLabel,
  updateAgent,
  updateAgentOrbit
} from "@/lib/agents";
import {
  acceptMission,
  ActiveMission,
  cancelMissionByAgent,
  completeMission,
  fetchActiveMissions,
  getMissionStatusLabel,
  isMissionActive,
  isMissionClosed,
  isMissionPending,
  startMission,
} from "@/lib/missions";
import { subscribeToTableChanges } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

const radiusOptions = [5, 10, 20, 30, 50];

const selectableServiceTypes = agentServiceTypes;

const operationalLabelStyles: Record<string, string> = {
  "En órbita": "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  "Fuera de horario": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-red-300/15 bg-red-400/10 text-red-200",
  "Fuera de zona": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de órbita": "border-white/10 bg-white/[0.04] text-orbi-muted"
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentPrivatePanel({ agentId }: { agentId: string }) {
  // ── Agent state ──────────────────────────────────────────────────────────
  const [agent, setAgent] = useState<OrbiAgent | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);

  // ── Form fields — only set from Supabase, never from local defaults ──────
  const [photoUrl, setPhotoUrl] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [description, setDescription] = useState("");
  const [formServiceType, setFormServiceType] = useState<AgentServiceType>("Mandados");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [radiusKm, setRadiusKm] = useState("20");

  // ── Save state ───────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Orbit state ──────────────────────────────────────────────────────────
  const [orbitError, setOrbitError] = useState("");
  const [orbitMsg, setOrbitMsg] = useState("");
  const [isEnteringOrbit, setIsEnteringOrbit] = useState(false);

  // ── Missions ─────────────────────────────────────────────────────────────
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [missionMessage, setMissionMessage] = useState("");
  const [missionError, setMissionError] = useState("");
  const [availabilityRefreshAt, setAvailabilityRefreshAt] = useState(() => new Date());
  // IDs of missions this agent released — persisted in sessionStorage so reloads don't re-show them.
  const SESSION_KEY = `released_missions_${agentId}`;
  const [releasedIds, setReleasedIds] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null;
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // ── populateForm: applies a DB row to all form fields ───────────────────
  // Only called with data that came from Supabase — never with local defaults.
  const populateForm = useCallback((a: OrbiAgent) => {
    const parts = getAvailabilityParts(a.availability ?? "");
    setPhotoUrl(a.photoUrl ?? "");
    setVehicle(a.vehicle ?? "");
    setDescription(a.description ?? "");
    setFormServiceType(a.serviceType);
    setAvailabilityStart(parts.start);
    setAvailabilityEnd(parts.end);
    setRadiusKm(String(a.radiusKm ?? 20));
    setAvailabilityRefreshAt(new Date());
  }, []);

  // ── loadAgent: reads from Supabase and populates form ───────────────────
  // Called on mount and on manual refresh. NOT wired to realtime.
  const loadAgent = useCallback(async () => {
    setIsLoadingAgent(true);
    try {
      const a = await getAgentById(agentId);
      if (a) {
        setAgent(a);
        populateForm(a);
      }
    } finally {
      setIsLoadingAgent(false);
    }
  }, [agentId, populateForm]);

  // Mount: load once from Supabase. No realtime subscription — eliminated.
  useEffect(() => { void loadAgent(); }, [loadAgent]);

  // Missions: Supabase is the source of truth. Fetch on mount and on realtime push.
  useEffect(() => {
    const refresh = async () => setMissions(await fetchActiveMissions());
    void refresh();
    const unsub = subscribeToTableChanges("missions", () => void refresh());
    return unsub;
  }, []);

  // ── Enter orbit ──────────────────────────────────────────────────────────
  async function handleEnterOrbit() {
    if (!agent) return;
    setOrbitError("");
    setOrbitMsg("");
    setIsEnteringOrbit(true);
    try {
      const pos = await getCurrentPosition();
      const fresh = await updateAgentOrbit(agentId, {
        isOnOrbit: true,
        lat: pos.latitude,
        lng: pos.longitude,
        radiusKm: Number(radiusKm),
        serviceType: agent.serviceType,
        availability: agent.availability
      });
      setAgent(fresh);
      populateForm(fresh);
      setOrbitMsg(`En órbita. GPS: ${pos.latitude.toFixed(5)}, ${pos.longitude.toFixed(5)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo obtener la ubicación GPS.";
      setOrbitError(`GPS no disponible: ${msg}. Asegúrate de dar permiso de ubicación al navegador.`);
    } finally {
      setIsEnteringOrbit(false);
    }
  }

  // ── Exit orbit ───────────────────────────────────────────────────────────
  async function handleExitOrbit() {
    if (!agent) return;
    setOrbitError("");
    setOrbitMsg("");
    try {
      const fresh = await updateAgentOrbit(agentId, {
        isOnOrbit: false,
        radiusKm: Number(radiusKm),
        serviceType: agent.serviceType,
        availability: agent.availability
      });
      setAgent(fresh);
      populateForm(fresh);
      setOrbitMsg("Saliste de órbita. Tus coordenadas GPS quedan guardadas.");
    } catch (e) {
      setOrbitError(e instanceof Error ? e.message : "No se pudo salir de órbita.");
    }
  }

  // ── Save profile ─────────────────────────────────────────────────────────
  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!agent) return;

    if (
      availabilityStart !== "24 horas" &&
      availabilityEnd !== "24 horas" &&
      availabilityStart &&
      availabilityEnd &&
      availabilityStart >= availabilityEnd
    ) {
      setSaveError("La hora fin debe ser posterior a la hora inicio.");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const payload = {
      name: agent.name,
      photoUrl: photoUrl.trim(),
      initials: getAgentInitials(agent.name),
      serviceType: formServiceType,
      zone: agent.zone,
      status: agent.status,
      isOnOrbit: agent.isOnOrbit,
      trustLevel: agent.trustLevel,
      phone: agent.phone,
      description,
      vehicle,
      availability: formatAvailability(availabilityStart, availabilityEnd),
      lat: agent.lat,
      lng: agent.lng,
      currentLat: agent.currentLat,
      currentLng: agent.currentLng,
      radiusKm: Number(radiusKm),
      email: agent.email,
      authUserId: agent.authUserId
    };

    try {
      // updateAgent: UPDATE → SELECT → returns fresh DB row. No reconstruction from input.
      const saved = await updateAgent(agentId, payload);
      // Apply the DB-confirmed values. No loadAgent, no realtime. This is the source of truth.
      setAgent(saved);
      populateForm(saved);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Mission handlers ─────────────────────────────────────────────────────
  async function handleAcceptMission(mission: ActiveMission) {
    if (!agent) return;
    setMissionError("");
    // Guarda de seguridad: rechazar si la misión ya tiene otro agente asignado
    if (mission.selected_agent_id && mission.selected_agent_id !== realAgentId) {
      setMissionError("Esta misión ya fue asignada a otro agente.");
      return;
    }
    const currentLoc = getAgentCurrentLocation(agent);
    const result = await acceptMission(mission.id, agent.id, agent.name, {
      zone: agent.zone,
      vehicle: agent.vehicle ?? undefined,
      trust: agent.trustLevel,
      lat: currentLoc?.lat ?? agent.currentLat ?? agent.lat,
      lng: currentLoc?.lng ?? agent.currentLng ?? agent.lng,
    });
    if (!result) {
      setMissionError("No se pudo aceptar la misión. Intenta de nuevo.");
      return;
    }
    setMissions(await fetchActiveMissions());
    setMissionMessage("Misión aceptada. Dirígete al origen.");
  }

  async function handleCancelMission(mission: ActiveMission) {
    const ok = await cancelMissionByAgent(mission.id, realAgentId);
    if (!ok) {
      setMissionMessage("Error: no se pudo liberar la misión. Revisa la consola.");
      return;
    }
    setReleasedIds((prev) => {
      const next = new Set(Array.from(prev).concat(mission.id));
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
    setMissions(await fetchActiveMissions());
    setMissionMessage("Misión liberada. Volvió a estar disponible para otros agentes.");
  }

  async function handleAdvanceMission(mission: ActiveMission) {
    if (mission.status === "aceptada") {
      const result = await startMission(mission.id, realAgentId);
      if (!result) { setMissionError("No se pudo iniciar la ruta."); return; }
      setMissions(await fetchActiveMissions());
      setMissionMessage("Ruta iniciada. Misión en curso.");
    } else if (mission.status === "en_mision") {
      const result = await completeMission(mission.id, realAgentId);
      if (!result) { setMissionError("No se pudo confirmar la entrega."); return; }
      setMissions(await fetchActiveMissions());
      setMissionMessage("Entrega confirmada. Misión cumplida.");
    }
  }

  // ── Derived UI ───────────────────────────────────────────────────────────
  const realAgentId = agent?.id ?? agentId;

  const myMissions = useMemo(() => {
    if (!agent) return [];
    return missions.filter((m) => {
      if (isMissionClosed(m)) return false;
      if (releasedIds.has(m.id)) return false;
      // "Asignada a ti": solo si selected_agent_id coincide y está activa
      if (isMissionActive(m) && m.selected_agent_id === realAgentId) return true;
      // "Disponible para ti": por_tomar sin agente asignado, o pre-asignada a este agente
      if (!isMissionPending(m)) return false;
      if (m.selected_agent_id != null && m.selected_agent_id !== realAgentId) return false;
      const origin =
        m.origin_lat != null && m.origin_lng != null
          ? { lat: m.origin_lat, lng: m.origin_lng }
          : null;
      const serviceType = compatibleServiceType(m.service_type);
      const eligibility = getAgentOperatingEligibility(agent, serviceType, origin, availabilityRefreshAt);
      if (!eligibility.eligible) return false;
      return true;
    });
  }, [agent, missions, realAgentId, availabilityRefreshAt, releasedIds]);

  const operationalLabel = agent ? getAgentOperationalLabel(agent, availabilityRefreshAt) : "";
  const currentGps = agent ? getAgentCurrentLocation(agent) : null;
  const timeOptions = buildTimeOptions();

  // ── Render ───────────────────────────────────────────────────────────────
  if (isLoadingAgent) {
    return <p className="text-sm text-orbi-muted">Cargando tu perfil desde Supabase...</p>;
  }

  if (!agent) {
    return (
      <div className="rounded-md border border-red-300/20 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
        Tu ficha de agente no fue encontrada en Supabase. Contacta al administrador.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Estado operativo ─────────────────────────────────────── */}
      <section className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <Orbit aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                  operationalLabelStyles[operationalLabel] ?? "border-white/10 bg-white/[0.04] text-orbi-muted"
                }`}
              >
                {operationalLabel}
              </span>
              <p className="mt-1 text-xs text-orbi-muted">Nivel {agent.trustLevel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAgent()}
            className="inline-flex items-center gap-1.5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.06] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/12"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>

        {currentGps ? (
          <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] px-3 py-2 text-xs">
            <p className="font-bold text-orbi-cyan">Última posición GPS</p>
            <p className="mt-1 font-mono text-orbi-muted">
              {currentGps.lat?.toFixed(6)}, {currentGps.lng?.toFixed(6)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-orbi-muted">Sin posición GPS registrada aún. Entra en órbita para fijar tu ubicación.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {!agent.isOnOrbit ? (
            <button
              type="button"
              onClick={() => void handleEnterOrbit()}
              disabled={isEnteringOrbit}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] disabled:opacity-50"
            >
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              {isEnteringOrbit ? "Obteniendo GPS..." : "Entrar en órbita con GPS"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleExitOrbit()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-5 py-2 text-sm font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text"
            >
              Salir de órbita
            </button>
          )}
        </div>

        {orbitError ? (
          <p className="rounded-md border border-red-300/20 bg-red-400/10 p-3 text-xs font-semibold text-red-200">
            {orbitError}
          </p>
        ) : null}
        {orbitMsg ? (
          <p className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.07] p-3 text-xs font-semibold text-orbi-cyan">
            {orbitMsg}
          </p>
        ) : null}
      </section>

      {/* ── Mis misiones ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
          <h2 className="text-base font-black text-orbi-text">Mis misiones</h2>
          <p className="mt-1 text-xs text-orbi-muted">
            Solo aparecen si estás en órbita, dentro de tu horario, radio y tipo de servicio.
          </p>
        </div>

        {missionError ? (
          <p className="rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm font-bold text-red-100">
            {missionError}
          </p>
        ) : null}
        {missionMessage ? (
          <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
            {missionMessage}
          </p>
        ) : null}

        {myMissions.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Sin misiones activas. Para recibir misiones debes estar en órbita con GPS, dentro de tu horario y radio operativo.
          </p>
        ) : (
          <div className="space-y-4">
            {myMissions.map((m) => {
              const isAssigned = isMissionActive(m) && m.selected_agent_id === realAgentId;
              return (
                <article
                  key={m.id}
                  className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)]"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                        {isAssigned ? "Asignada a ti" : "Disponible para ti"}
                      </p>
                      <h3 className="mt-1 text-xl font-black text-orbi-text">{m.service_type}</h3>
                      <p className="mt-0.5 font-mono text-[10px] text-orbi-muted/60">Folio: #{m.id.slice(-8).toUpperCase()}</p>
                      <p className="mt-2 text-sm leading-6 text-orbi-muted">{m.detail}</p>
                    </div>
                    <span className="w-fit rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
                      {m.status === "por_tomar" ? "Por tomar" : getMissionStatusLabel(m.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                    <InfoTile label="Origen" value={m.origin_text} />
                    <InfoTile label="Destino" value={m.destination_text} />
                    <InfoTile label="Solicitante" value={m.requester_name} />
                    <InfoTile label="Teléfono" value={m.requester_phone} />
                    <InfoTile label="Pago" value={`${m.payment_status} · ${m.payment_method}`} />
                    <InfoTile label="Órbita estimada" value={m.estimated_orbit} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isMissionPending(m) ? (
                      <button
                        type="button"
                        onClick={() => handleAcceptMission(m)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
                      >
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        Aceptar misión
                      </button>
                    ) : null}
                    {isMissionActive(m) ? (
                      <Link
                        href={`/orbita?missionId=${m.id}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
                      >
                        <Navigation aria-hidden="true" className="h-4 w-4" />
                        Ver ruta
                      </Link>
                    ) : null}
                    {m.status === "aceptada" ? (
                      <button
                        type="button"
                        onClick={() => handleAdvanceMission(m)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                      >
                        <Navigation aria-hidden="true" className="h-4 w-4" />
                        Iniciar ruta
                      </button>
                    ) : null}
                    {m.status === "en_mision" ? (
                      <button
                        type="button"
                        onClick={() => handleAdvanceMission(m)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
                      >
                        <PackageCheck aria-hidden="true" className="h-4 w-4" />
                        Confirmar entrega
                      </button>
                    ) : null}
                    {isAssigned ? (
                      <button
                        type="button"
                        onClick={() => handleCancelMission(m)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
                      >
                        <XCircle aria-hidden="true" className="h-4 w-4" />
                        Liberar misión
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Perfil operativo ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <UserRound aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-base font-black text-orbi-text">Mi perfil operativo</h2>
              <p className="mt-1 text-xs text-orbi-muted">
                Estos datos se muestran a clientes y se usan para filtrar misiones.
              </p>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSaveProfile(e)}
          className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] sm:grid-cols-2 sm:p-6"
        >
          <FieldInput
            label="Foto URL"
            value={photoUrl}
            onChange={setPhotoUrl}
            placeholder="https://..."
          />
          <FieldInput
            label="Vehículo / placa"
            value={vehicle}
            onChange={setVehicle}
            placeholder="Moto azul / ABC-123"
          />

          <label className="block text-sm font-semibold text-orbi-text">
            Tipo de servicio
            <select
              value={formServiceType}
              onChange={(e) => setFormServiceType(e.target.value as AgentServiceType)}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            >
              {selectableServiceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold text-orbi-text">
            Radio operativo
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            >
              {radiusOptions.map((r) => (
                <option key={r} value={r}>{r} km</option>
              ))}
            </select>
          </label>

          <TimeSelect label="Hora inicio" value={availabilityStart} onChange={setAvailabilityStart} options={timeOptions} />
          <TimeSelect label="Hora fin" value={availabilityEnd} onChange={setAvailabilityEnd} options={timeOptions} />

          <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
            Descripción breve
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Tu especialidad, experiencia, cobertura..."
              className="mt-2 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            />
          </label>

          {saveError ? (
            <p className="rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm font-semibold text-red-100 sm:col-span-2">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className="rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200 sm:col-span-2">
              Perfil guardado en Supabase.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] disabled:opacity-50 sm:col-span-2"
          >
            {isSaving ? "Guardando en Supabase..." : "Guardar perfil"}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
      />
    </label>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
      >
        <option value="">Sin restricción horaria</option>
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </label>
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

// ── Pure helpers ──────────────────────────────────────────────────────────────

function buildTimeOptions(): string[] {
  const opts: string[] = ["24 horas"];
  for (let h = 6; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 23) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}

function formatAvailability(start: string, end: string): string {
  if (start === "24 horas" || end === "24 horas") return "24 horas";
  if (!start && !end) return "";
  if (start && !end) return start;
  return `${start} - ${end}`;
}

function getAvailabilityParts(availability: string): { start: string; end: string } {
  if (availability.trim().toLowerCase() === "24 horas") return { start: "24 horas", end: "" };
  const match = availability.match(/(.+?)\s*-\s*(.+)/);
  return match
    ? { start: match[1].trim(), end: match[2].trim() }
    : { start: availability.trim(), end: "" };
}

function compatibleServiceType(missionService: string): AgentServiceType {
  const map: Record<string, AgentServiceType> = {
    Mandado: "Mandados",
    Entrega: "Entregas",
    Traslado: "Traslados",
    "Compra local": "Compras",
    Recolección: "Recolecciones",
    "Pago o trámite": "Mandados"
  };
  return map[missionService] ?? "Mandados";
}

function getCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tu navegador no soporta geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
