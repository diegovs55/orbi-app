"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LocateFixed,
  MapPin,
  Navigation,
  Orbit,
  PackageCheck,
  RefreshCw,
  UserRound,
  X,
  XCircle
} from "lucide-react";
import {
  AGENT_STATUS,
  AgentServiceType,
  OrbiAgent,
  getAgentById,
  getAgentCurrentLocation,
  getAgentInitials,
  getAgentLocation,
  getAgentOperatingEligibility,
  getAgentOperationalLabel,
  updateAgent,
  updateAgentOrbit
} from "@/lib/agents";
import {
  ActiveMission,
  getActiveMissions,
  getMissionStatusLabel,
  isMissionActive,
  isMissionClosed,
  isMissionPending,
  loadActiveMissionsFromSupabase,
  subscribeToMission,
  updateActiveMissionById
} from "@/lib/missions";
import { subscribeToAgents } from "@/lib/supabase";

const zumpahuacanCenter = { lat: 18.8349, lng: -99.5818 };
const radiusOptions = [10, 20, 30];

const operationalLabelStyles: Record<string, string> = {
  "En órbita": "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  "Fuera de horario": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-red-300/15 bg-red-400/10 text-red-200",
  "Fuera de zona": "border-yellow-300/15 bg-yellow-300/10 text-yellow-100",
  "Fuera de órbita": "border-white/10 bg-white/[0.04] text-orbi-muted"
};

const LocationPickerMap = dynamic(
  () => import("@/components/LocationPickerMap").then((m) => m.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-orbi-black text-sm text-orbi-muted">
        Cargando mapa...
      </div>
    )
  }
);

export function AgentPrivatePanel({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [agent, setAgent] = useState<OrbiAgent | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [orbitError, setOrbitError] = useState("");
  const [orbitMsg, setOrbitMsg] = useState("");

  // Form fields — populated from Supabase on load
  const [photoUrl, setPhotoUrl] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [description, setDescription] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [operationalBaseText, setOperationalBaseText] = useState("");
  const [radiusKm, setRadiusKm] = useState("20");

  // Map
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapPoint, setMapPoint] = useState(zumpahuacanCenter);

  // Missions
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [missionMessage, setMissionMessage] = useState("");
  const [missionError, setMissionError] = useState("");
  const [availabilityRefreshAt, setAvailabilityRefreshAt] = useState(() => new Date());

  // Populate form from agent data
  const populateForm = useCallback((a: OrbiAgent) => {
    setPhotoUrl(a.photoUrl ?? "");
    setVehicle(a.vehicle ?? "");
    setDescription(a.description ?? "");
    const parts = getAvailabilityParts(a.availability ?? "");
    setAvailabilityStart(parts.start);
    setAvailabilityEnd(parts.end);
    const loc = getAgentLocation(a);
    setLat(loc ? String(loc.lat) : "");
    setLng(loc ? String(loc.lng) : "");
    setOperationalBaseText(a.operationalBaseText || a.zone || "");
    setRadiusKm(String(a.radiusKm ?? 20));
    setAvailabilityRefreshAt(new Date());
  }, []);

  // Load agent from Supabase (source of truth)
  const loadAgent = useCallback(async () => {
    const a = await getAgentById(agentId);
    if (a) {
      setAgent(a);
      populateForm(a);
    }
    setIsLoadingAgent(false);
  }, [agentId, populateForm]);

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  useEffect(() => {
    return subscribeToAgents(() => void loadAgent());
  }, [loadAgent]);

  // Load missions
  useEffect(() => {
    const load = async () => {
      await loadActiveMissionsFromSupabase();
      setMissions(getActiveMissions());
    };
    void load();
    return subscribeToMission(() => void load());
  }, []);

  // Missions for this agent only
  const myMissions = useMemo(() => {
    if (!agent) return [];
    return missions.filter((m) => {
      if (isMissionClosed(m)) return false;
      if (isMissionActive(m) && m.active_agent_id === agentId) return true;
      if (!isMissionPending(m)) return false;
      const origin =
        m.origin_lat != null && m.origin_lng != null
          ? { lat: m.origin_lat, lng: m.origin_lng }
          : null;
      const serviceType = getCompatibleServiceType(m.service_type);
      const eligibility = getAgentOperatingEligibility(
        agent,
        serviceType,
        origin,
        availabilityRefreshAt
      );
      if (!eligibility.eligible) {
        console.log(
          `[agent] misión ${m.id} (${m.service_type}) excluida — ${eligibility.reason}`,
          {
            agentId,
            missionId: m.id,
            serviceType,
            origin,
            reason: eligibility.reason,
            distanceKm: eligibility.distanceKm
          }
        );
        return false;
      }
      const agentLoc = getAgentLocation(agent);
      if (!agentLoc) {
        console.warn("[agent] misión excluida — agente sin ubicación válida", { agentId, missionId: m.id });
        return false;
      }
      if (!origin) {
        console.warn("[agent] misión excluida — misión sin coordenadas de origen", { agentId, missionId: m.id });
        return false;
      }
      return true;
    });
  }, [agent, missions, agentId, availabilityRefreshAt]);

  // Orbit: take using GPS
  async function handleTakeOrbitGPS() {
    if (!agent) return;
    setOrbitError("");
    setOrbitMsg("");
    try {
      const pos = await getCurrentPosition();
      await updateAgentOrbit(agentId, {
        status: AGENT_STATUS.ONLINE,
        isOnOrbit: true,
        lat: pos.latitude,
        lng: pos.longitude,
        radiusKm: Number(radiusKm),
        serviceType: agent.serviceType,
        availability: agent.availability,
        operationalBaseText: "Ubicación actual (GPS)"
      });
      setLat(String(pos.latitude));
      setLng(String(pos.longitude));
      setOperationalBaseText("Ubicación actual (GPS)");
      setOrbitMsg("Tomaste órbita con tu ubicación GPS actual.");
      await loadAgent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo obtener la ubicación GPS.";
      setOrbitError(`GPS: ${msg}. Si no tienes GPS, configura tu base en el mapa y usa "Tomar órbita desde mi base".`);
    }
  }

  // Orbit: take using configured base coordinates
  async function handleTakeOrbitFromBase() {
    if (!agent) return;
    const parsedLat = parseNum(lat);
    const parsedLng = parseNum(lng);
    if (parsedLat === null || parsedLng === null) {
      console.warn("[agent] órbita bloqueada — sin coordenadas de base", { agentId, lat, lng });
      setOrbitError("Configura tu base operativa en el mapa antes de tomar órbita.");
      return;
    }
    setOrbitError("");
    setOrbitMsg("");
    try {
      await updateAgentOrbit(agentId, {
        status: AGENT_STATUS.ONLINE,
        isOnOrbit: true,
        lat: parsedLat,
        lng: parsedLng,
        radiusKm: Number(radiusKm),
        serviceType: agent.serviceType,
        availability: agent.availability,
        operationalBaseText: operationalBaseText || agent.zone
      });
      setOrbitMsg("Tomaste órbita desde tu base operativa configurada.");
      await loadAgent();
    } catch (e) {
      setOrbitError(e instanceof Error ? e.message : "No se pudo tomar órbita.");
    }
  }

  // Orbit: exit
  async function handleExitOrbit() {
    if (!agent) return;
    setOrbitError("");
    setOrbitMsg("");
    try {
      await updateAgentOrbit(agentId, {
        status: AGENT_STATUS.ONLINE,
        isOnOrbit: false,
        lat: null,
        lng: null,
        radiusKm: Number(radiusKm),
        serviceType: agent.serviceType,
        availability: agent.availability,
        operationalBaseText: operationalBaseText || agent.zone
      });
      setOrbitMsg("Saliste de órbita. Sigues disponible.");
      await loadAgent();
    } catch (e) {
      setOrbitError(e instanceof Error ? e.message : "No se pudo salir de órbita.");
    }
  }

  // Map base confirm
  async function handleConfirmBase() {
    setLat(String(mapPoint.lat));
    setLng(String(mapPoint.lng));
    setOperationalBaseText(await getBaseLabel(mapPoint));
    setIsMapOpen(false);
  }

  // Save profile → Supabase → re-fetch to confirm persistence
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
    const parsedLat = parseNum(lat);
    const parsedLng = parseNum(lng);
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    if (parsedLat === null || parsedLng === null) {
      console.warn("[agent] guardando perfil sin coordenadas de base", { agentId, lat, lng });
    }
    const profilePayload = {
      name: agent.name,
      photoUrl: photoUrl.trim(),
      initials: getAgentInitials(agent.name),
      serviceType: agent.serviceType,
      zone: operationalBaseText || agent.zone,
      status: agent.status,
      isOnOrbit: agent.isOnOrbit,
      trustLevel: agent.trustLevel,
      phone: agent.phone,
      description,
      vehicle,
      availability: formatAvailability(availabilityStart, availabilityEnd),
      lat: parsedLat,
      lng: parsedLng,
      currentLat: agent.isOnOrbit ? parsedLat : null,
      currentLng: agent.isOnOrbit ? parsedLng : null,
      latitude: agent.latitude,
      longitude: agent.longitude,
      operationalBaseLat: parsedLat,
      operationalBaseLng: parsedLng,
      operationalBaseText: operationalBaseText || agent.zone,
      radiusKm: Number(radiusKm)
    };
    try {
      await updateAgent(agentId, profilePayload);
      console.log("[agent] perfil guardado en Supabase", { agentId, fields: profilePayload });
      // Re-fetch from Supabase to confirm persistence
      await loadAgent();
      setSaveSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo guardar el perfil.";
      console.error("[agent] updateAgent falló", { agentId, error: msg, payload: profilePayload });
      setSaveError(
        `${msg}. Si el error persiste, verifica que las políticas RLS de Supabase permitan UPDATE en la tabla agents con el rol anon.`
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Mission handlers
  function handleAcceptMission(mission: ActiveMission) {
    if (!agent) return;
    setMissionError("");
    const currentLoc = getAgentCurrentLocation(agent);
    updateActiveMissionById(mission.id, {
      status: "aceptada",
      selected_agent_id: agent.id,
      selected_agent_name: agent.name,
      selected_agent_zone: agent.zone,
      selected_agent_vehicle: agent.vehicle,
      selected_agent_trust: agent.trustLevel,
      selected_agent_lat: currentLoc?.lat ?? agent.currentLat ?? agent.lat,
      selected_agent_lng: currentLoc?.lng ?? agent.currentLng ?? agent.lng,
      active_agent_id: agent.id,
      accepted_at: new Date().toISOString()
    });
    setMissions(getActiveMissions());
    setMissionMessage("Misión aceptada. Dirígete al origen.");
    router.push("/orbita");
  }

  function handleCancelMission(mission: ActiveMission) {
    updateActiveMissionById(mission.id, {
      status: "cancelada",
      active_agent_id: mission.active_agent_id || agentId
    });
    setMissions(getActiveMissions());
    setMissionMessage("Misión cancelada.");
  }

  function handleAdvanceMission(mission: ActiveMission) {
    if (mission.status === "aceptada") {
      updateActiveMissionById(mission.id, { status: "en_mision" });
      setMissions(getActiveMissions());
      setMissionMessage("Ruta iniciada. Misión en curso.");
    } else if (mission.status === "en_mision") {
      updateActiveMissionById(mission.id, { status: "cumplida" });
      setMissions(getActiveMissions());
      setMissionMessage("Entrega confirmada. Misión cumplida.");
    }
  }

  const operationalLabel = agent
    ? getAgentOperationalLabel(agent, availabilityRefreshAt)
    : "";
  const timeOptions = buildTimeOptions();
  const hasBase = parseNum(lat) !== null && parseNum(lng) !== null;

  if (isLoadingAgent) {
    return (
      <p className="text-sm text-orbi-muted">Cargando tu perfil desde Supabase...</p>
    );
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

      {/* ── Mis misiones ───────────────────────────────────── */}
      <section className="space-y-4">
        <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <Orbit aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg font-black text-orbi-text">Mis misiones</h2>
              <p className="mt-1 text-xs text-orbi-muted">
                Solo misiones compatibles con tu servicio, zona y horario. Debes estar en órbita para verlas.
              </p>
            </div>
          </div>
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
            No hay misiones activas para ti ahora. Asegúrate de estar en órbita con base operativa configurada.
          </p>
        ) : (
          <div className="space-y-4">
            {myMissions.map((m) => {
              const isAssigned = isMissionActive(m) && m.active_agent_id === agentId;
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
                    {!isMissionClosed(m) ? (
                      <button
                        type="button"
                        onClick={() => handleCancelMission(m)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
                      >
                        <XCircle aria-hidden="true" className="h-4 w-4" />
                        Cancelar
                      </button>
                    ) : null}
                    {isMissionActive(m) ? (
                      <Link
                        href="/orbita"
                        className="inline-flex min-h-11 items-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
                      >
                        Ver en órbita
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Mi perfil operativo ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
                <UserRound aria-hidden="true" className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-black text-orbi-text">Mi perfil operativo</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-orbi-muted">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                      operationalLabelStyles[operationalLabel] ??
                      "border-white/10 bg-white/[0.04] text-orbi-muted"
                    }`}
                  >
                    {operationalLabel}
                  </span>
                  <span>Nivel {agent.trustLevel}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadAgent()}
              className="inline-flex items-center gap-1.5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.06] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/12"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              Actualizar desde Supabase
            </button>
          </div>
        </div>

        {/* Orbit controls */}
        <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 space-y-3">
          <p className="text-sm font-black text-orbi-text">Control de órbita</p>
          <p className="text-xs text-orbi-muted">
            Debes tener base operativa configurada para tomar órbita. Sin base, no podrás recibir misiones.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleTakeOrbitGPS()}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              Tomar órbita con GPS
            </button>
            {hasBase ? (
              <button
                type="button"
                onClick={() => void handleTakeOrbitFromBase()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
              >
                <MapPin aria-hidden="true" className="h-4 w-4" />
                Tomar órbita desde mi base
              </button>
            ) : null}
            {agent.isOnOrbit ? (
              <button
                type="button"
                onClick={() => void handleExitOrbit()}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text"
              >
                Salir de órbita
              </button>
            ) : null}
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
        </div>

        {/* Profile form */}
        <form
          onSubmit={(e) => void handleSaveProfile(e)}
          className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] sm:grid-cols-2 sm:p-6"
        >
          <FieldInput
            label="Foto URL"
            value={photoUrl}
            onChange={setPhotoUrl}
            placeholder="https://..."
            required={false}
          />
          <FieldInput
            label="Vehículo / placa"
            value={vehicle}
            onChange={setVehicle}
            placeholder="Moto azul / ABC-123"
            required={false}
          />
          <TimeSelect label="Hora inicio" value={availabilityStart} onChange={setAvailabilityStart} options={timeOptions} />
          <TimeSelect label="Hora fin" value={availabilityEnd} onChange={setAvailabilityEnd} options={timeOptions} />

          {/* Base operativa */}
          <div className="space-y-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
            <p className="text-sm font-black text-orbi-text">Base operativa</p>
            <p className="text-xs text-orbi-muted">
              Configura dónde operas. Esta base se usa para calcular cercanía a misiones y para tomar órbita sin GPS.
            </p>
            <button
              type="button"
              onClick={() => {
                setMapPoint(
                  parseNum(lat) !== null && parseNum(lng) !== null
                    ? { lat: Number(lat), lng: Number(lng) }
                    : zumpahuacanCenter
                );
                setIsMapOpen(true);
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              <MapPin aria-hidden="true" className="h-4 w-4" />
              Elegir base en mapa
            </button>
            <div className="rounded-md border border-white/10 bg-orbi-black/35 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">Base actual</p>
              <p className="mt-1 text-sm font-semibold text-orbi-text">
                {operationalBaseText || "Sin base configurada"}
              </p>
              {hasBase ? (
                <p className="mt-1 text-xs text-orbi-muted">
                  {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-yellow-200">
                  Sin coordenadas — debes elegir tu base en el mapa para recibir misiones.
                </p>
              )}
            </div>
          </div>

          {/* Radius */}
          <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
            Radio operativo
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            >
              {radiusOptions.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>

          {/* Descripción */}
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
              Perfil guardado en Supabase correctamente.
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

      {/* ── Map dialog ──────────────────────────────────────── */}
      {isMapOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
          <section className="max-h-[92vh] w-full overflow-hidden rounded-md border border-orbi-cyan/20 bg-orbi-panel shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-3xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 p-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">Base operativa</p>
                <h3 className="mt-1 text-lg font-black text-orbi-text">Elegir base en mapa</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[55vh] min-h-[320px]">
              <LocationPickerMap point={mapPoint} onPointChange={setMapPoint} />
            </div>
            <div className="grid gap-2 border-t border-white/10 p-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBase()}
                className="min-h-11 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow"
              >
                Confirmar base
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  required = true
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
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
        <option value="">Selecciona hora</option>
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTimeOptions(): string[] {
  const opts: string[] = ["24 horas"];
  for (let h = 6; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, "0")}:00`);
    if (h !== 23) opts.push(`${String(h).padStart(2, "0")}:30`);
  }
  return opts;
}

function formatAvailability(start: string, end: string): string {
  if (start === "24 horas" || end === "24 horas") return "24 horas";
  if (!start.trim() && !end.trim()) return "";
  return [start, end].filter(Boolean).join(" - ");
}

function getAvailabilityParts(availability: string) {
  if (availability.trim().toLowerCase() === "24 horas") return { start: "24 horas", end: "" };
  const match = availability.match(/(.+?)\s*-\s*(.+)/);
  return match
    ? { start: match[1].trim(), end: match[2].trim() }
    : { start: availability.trim(), end: "" };
}

function parseNum(value: string): number | null {
  const n = Number(value.trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function getCompatibleServiceType(missionService: string): AgentServiceType {
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
      reject,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function getBaseLabel(point: { lat: number; lng: number }): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        point.lat
      )}&lon=${encodeURIComponent(point.lng)}`
    );
    if (!res.ok) return "Base operativa";
    const json = (await res.json()) as {
      display_name?: string;
      address?: {
        neighbourhood?: string;
        suburb?: string;
        village?: string;
        town?: string;
        city?: string;
        municipality?: string;
        county?: string;
      };
    };
    const addr = json.address ?? {};
    return (
      addr.neighbourhood ||
      addr.suburb ||
      addr.village ||
      addr.town ||
      addr.city ||
      addr.municipality ||
      addr.county ||
      json.display_name ||
      "Base operativa"
    );
  } catch {
    return "Base operativa";
  }
}
