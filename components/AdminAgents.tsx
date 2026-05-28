"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Edit3, LocateFixed, MapPin, Plus, Trash2, UserRound, X } from "lucide-react";
import {
  AGENT_STATUS,
  AgentServiceType,
  AgentStatus,
  AgentTrustLevel,
  OrbiAgent,
  agentLevels,
  agentServiceTypes,
  createAgent,
  deleteAgent,
  getAgentInitials,
  getAgentLocation,
  getAgentLocationDiagnostics,
  getAgents,
  hasValidAgentId,
  updateAgent,
  updateAgentOrbit
} from "@/lib/agents";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";
const zumpahuacanCenter = { lat: 18.8349, lng: -99.5818 };
const radiusOptions = [10, 20, 30];
const defaultAgentLevel: AgentTrustLevel = "Aprendiz";
const timeOptions = buildTimeOptions();

const LocationPickerMap = dynamic(
  () => import("@/components/LocationPickerMap").then((mod) => mod.LocationPickerMap),
  {
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-orbi-black text-sm font-semibold text-orbi-muted">
        Cargando mapa...
      </div>
    ),
    ssr: false
  }
);

export function AdminAgents() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [agentError, setAgentError] = useState("");
  const [agentLat, setAgentLat] = useState("");
  const [agentLng, setAgentLng] = useState("");
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(AGENT_STATUS.OFFLINE);
  const [draftIsOnOrbit, setDraftIsOnOrbit] = useState(false);
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");
  const [operationalBaseText, setOperationalBaseText] = useState("");
  const [radiusKm, setRadiusKm] = useState("20");
  const [mapPoint, setMapPoint] = useState(zumpahuacanCenter);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<OrbiAgent | null>(null);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setAgentError("La consulta de agentes tardó demasiado. Revisa la conexión con Supabase.");
      setIsLoading(false);
    }, 8000);

    getAgents()
      .then((nextAgents) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents(nextAgents);
        setAgentError("");
      })
      .catch((caughtError: unknown) => {
        if (!isActive) {
          return;
        }

        window.clearTimeout(timeoutId);
        setAgents([]);
        setAgentError(
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

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

  async function handleSaveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const availability = formatAvailability(availabilityStart, availabilityEnd);

    if (availabilityStart && availabilityEnd && availabilityStart >= availabilityEnd) {
      setAgentError("La hora fin debe ser posterior a la hora inicio.");
      return;
    }

    const newAgent = {
      name,
      photoUrl: String(data.get("photoUrl") ?? "").trim(),
      initials: getAgentInitials(name),
      serviceType: String(data.get("serviceType")) as AgentServiceType,
      zone: operationalBaseText || String(data.get("zone") ?? "").trim(),
      status: agentStatus,
      isOnOrbit: draftIsOnOrbit,
      trustLevel: String(data.get("trustLevel") || defaultAgentLevel) as AgentTrustLevel,
      phone: String(data.get("phone") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      vehicle: String(data.get("vehicle") ?? "").trim(),
      availability,
      lat: parseOptionalNumber(data.get("lat")),
      lng: parseOptionalNumber(data.get("lng")),
      currentLat: draftIsOnOrbit ? parseOptionalNumber(data.get("lat")) : null,
      currentLng: draftIsOnOrbit ? parseOptionalNumber(data.get("lng")) : null,
      latitude: null,
      longitude: null,
      operationalBaseLat: parseOptionalNumber(data.get("lat")),
      operationalBaseLng: parseOptionalNumber(data.get("lng")),
      operationalBaseText: operationalBaseText || String(data.get("zone") ?? "").trim(),
      radiusKm: Number(radiusKm)
    };

    if (!newAgent.name || !newAgent.zone || !newAgent.phone || !newAgent.description) {
      return;
    }

    if (newAgent.isOnOrbit && !hasValidCoordinates(newAgent.lat, newAgent.lng)) {
      setAgentError("Para tomar órbita necesitas una ubicación operativa válida.");
      return;
    }

    setIsSaving(true);
    setAgentError("");

    try {
      const savedAgent = await createAgent(newAgent);
      setAgents((currentAgents) => [savedAgent, ...currentAgents]);
      form.reset();
      setAgentLat("");
      setAgentLng("");
      setAgentStatus(AGENT_STATUS.OFFLINE);
      setDraftIsOnOrbit(false);
      setAvailabilityStart("");
      setAvailabilityEnd("");
      setOperationalBaseText("");
      setRadiusKm("20");
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el agente."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTakeOrbitDraft() {
    setLocationMessage("");
    setAgentError("");

    try {
      const position = await getCurrentPosition();
      setAgentLat(position.latitude.toFixed(6));
      setAgentLng(position.longitude.toFixed(6));
      setOperationalBaseText("Ubicación actual del agente");
      setAgentStatus(AGENT_STATUS.ONLINE);
      setDraftIsOnOrbit(true);
      setLocationMessage("Agente en órbita con ubicación operativa actualizada.");
    } catch {
      setAgentStatus(AGENT_STATUS.OFFLINE);
      setDraftIsOnOrbit(false);
      setLocationMessage("No pudimos obtener la ubicación del agente. No se puede tomar órbita sin ubicación válida.");
    }
  }

  function handleExitOrbitDraft() {
    setDraftIsOnOrbit(false);
    setLocationMessage("El agente quedará fuera de órbita al guardar.");
  }

  async function handleTakeOrbitAgent(agent: OrbiAgent) {
    setAgentError("");

    if (!hasValidAgentId(agent)) {
      setAgentError("Este agente no tiene ID real de Supabase. Recarga la lista.");
      return;
    }

    try {
      const position = await getCurrentPosition();
      await updateAgentOrbit(agent.id, {
        status: AGENT_STATUS.ONLINE,
        isOnOrbit: true,
        lat: position.latitude,
        lng: position.longitude,
        radiusKm: agent.radiusKm,
        serviceType: agent.serviceType,
        availability: agent.availability,
        operationalBaseText: "Ubicación actual del agente"
      });
      const refreshedAgents = await getAgents();
      setAgents(refreshedAgents);
      setLocationMessage(`${agent.name} tomó órbita con ubicación operativa actualizada.`);
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible tomar órbita con este agente."
      );
    }
  }

  async function handleExitOrbitAgent(agent: OrbiAgent) {
    setAgentError("");

    if (!hasValidAgentId(agent)) {
      setAgentError("Este agente no tiene ID real de Supabase. Recarga la lista.");
      return;
    }

    try {
      await updateAgentOrbit(agent.id, {
        status: agent.status,
        isOnOrbit: false,
        lat: null,
        lng: null,
        radiusKm: agent.radiusKm,
        serviceType: agent.serviceType,
        availability: agent.availability,
        operationalBaseText: agent.operationalBaseText || agent.zone
      });
      setAgents(await getAgents());
      setLocationMessage(`${agent.name} salió de órbita.`);
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible sacar de órbita a este agente."
      );
    }
  }

  async function handleDeleteAgent(id: string) {
    setAgentError("");

    if (!hasValidAgentId({ id })) {
      setAgentError("Este agente no tiene id válido. Recarga la lista desde Supabase.");
      return;
    }

    try {
      await deleteAgent(id);
      setAgents((currentAgents) => currentAgents.filter((agent) => agent.id !== id));
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error ? caughtError.message : "No fue posible eliminar el agente."
      );
    }
  }

  async function handleConfirmBasePoint() {
    setAgentLat(mapPoint.lat.toFixed(6));
    setAgentLng(mapPoint.lng.toFixed(6));
    setOperationalBaseText(await getBaseLabel(mapPoint));
    setIsMapOpen(false);
  }

  function handleEditAgent(agent: OrbiAgent) {
    setAgentError("");

    if (!hasValidAgentId(agent)) {
      setAgentError("Este agente no tiene id válido. Recarga la lista desde Supabase.");
      return;
    }

    setEditingAgent(agent);
  }

  if (!isUnlocked) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <UserRound aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-black text-orbi-text">Agentes Orbi</h2>
            <p className="mt-1 text-xs text-orbi-muted">
              Registra perfiles operativos para mostrarlos en la red pública.
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSaveAgent}
        className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:grid-cols-2 sm:p-6"
      >
        <Input label="Nombre" name="name" placeholder="Ej. Diego Ramírez" />
        <Input label="Foto URL" name="photoUrl" placeholder="https://..." required={false} />
        <label className="block text-sm font-semibold text-orbi-text">
          Tipo de servicio
          <select
            name="serviceType"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue="Mandados"
          >
            {agentServiceTypes.map((serviceType) => (
              <option key={serviceType} value={serviceType}>
                {serviceType}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-orbi-text">
          Nivel
          <select
            name="trustLevel"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue={defaultAgentLevel}
          >
            {agentLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
          <p className="text-sm font-black text-orbi-text">Zona/base operativa</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMapPoint(
                  hasValidCoordinates(parseOptionalNumber(agentLat), parseOptionalNumber(agentLng))
                    ? { lat: Number(agentLat), lng: Number(agentLng) }
                    : zumpahuacanCenter
                );
                setIsMapOpen(true);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              <MapPin aria-hidden="true" className="h-4 w-4" />
              Elegir base en mapa
            </button>
            <button
              type="button"
              onClick={handleTakeOrbitDraft}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              <LocateFixed aria-hidden="true" className="h-4 w-4" />
              Usar mi ubicación y tomar órbita
            </button>
          </div>
          <div className="rounded-md border border-white/10 bg-orbi-black/35 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
              Base operativa
            </p>
            <p className="mt-1 text-sm font-semibold text-orbi-text">
              {operationalBaseText || "Sin base marcada todavía"}
            </p>
            {hasValidCoordinates(parseOptionalNumber(agentLat), parseOptionalNumber(agentLng)) ? (
              <p className="mt-1 text-xs text-orbi-muted">
                {Number(agentLat).toFixed(6)}, {Number(agentLng).toFixed(6)}
              </p>
            ) : null}
          </div>
          {locationMessage ? (
            <p className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-3 text-xs font-semibold text-orbi-muted">
              {locationMessage}
            </p>
          ) : null}
        </div>
        <Input label="Teléfono/WhatsApp interno" name="phone" placeholder="5255..." />
        <Input label="Placa o vehículo" name="vehicle" placeholder="Moto azul / ABC-123" required={false} />
        <TimeSelect
          label="Hora inicio"
          value={availabilityStart}
          onChange={setAvailabilityStart}
          required={false}
        />
        <TimeSelect
          label="Hora fin"
          value={availabilityEnd}
          onChange={setAvailabilityEnd}
          required={false}
        />
        <Input
          label="Latitud operativa actual"
          name="lat"
          placeholder="19.4326"
          value={agentLat}
          onChange={setAgentLat}
          required={false}
        />
        <Input
          label="Longitud operativa actual"
          name="lng"
          placeholder="-99.1332"
          value={agentLng}
          onChange={setAgentLng}
          required={false}
        />
        <label className="block text-sm font-semibold text-orbi-text">
          Radio operativo km
          <select
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            name="radiusKm"
            value={radiusKm}
            onChange={(event) => setRadiusKm(event.target.value)}
          >
            {radiusOptions.map((option) => (
              <option key={option} value={option}>
                {option} km
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
          Descripción breve
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
            name="description"
            placeholder="Perfil operativo, experiencia o especialidad"
            required
          />
        </label>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] focus:outline-none focus:ring-2 focus:ring-orbi-cyan/70 focus:ring-offset-2 focus:ring-offset-orbi-black sm:col-span-2"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
          {isSaving ? "Guardando..." : "Guardar agente"}
        </button>
      </form>

      <section className="rounded-md border border-white/10 bg-orbi-panel/70 p-4 shadow-soft backdrop-blur sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-orbi-text">Agentes guardados</h2>
          <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
            {agents.length}
          </span>
        </div>

        {agentError ? (
          <p className="mb-4 rounded-md border border-red-300/15 bg-red-400/10 p-4 text-sm font-semibold text-red-200">
            {agentError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Cargando agentes guardados...
          </p>
        ) : sortedAgents.length ? (
          <div className="space-y-3">
            {sortedAgents.map((agent) => (
              <article
                key={agent.id}
                className="rounded-md border border-orbi-cyan/12 bg-white/[0.04] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                      {agent.serviceType} · {agent.zone}
                    </p>
                    <h3 className="mt-1 font-black text-orbi-text">{agent.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-orbi-muted">
                      {agent.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditAgent(agent)}
                    aria-label={`Editar ${agent.name}`}
                    disabled={!hasValidAgentId(agent)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] text-orbi-cyan transition hover:bg-orbi-blue/15"
                  >
                    <Edit3 aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAgent(agent.id)}
                    aria-label={`Eliminar ${agent.name}`}
                    disabled={!hasValidAgentId(agent)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-300/15 bg-red-400/10 text-red-200 transition hover:bg-red-400/20"
                  >
                    <Trash2 aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    {agent.status}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    {agent.isOnOrbit ? "En órbita" : "Fuera de órbita"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                    Nivel {agent.trustLevel}
                  </span>
                  {agent.vehicle ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                      {agent.vehicle}
                    </span>
                  ) : null}
                  {getAgentLocation(agent) ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                      {getAgentLocationBadge(agent)}
                    </span>
                  ) : (
                    <span className="rounded-full border border-red-300/15 bg-red-400/10 px-3 py-1 text-red-200">
                      Sin ubicación operativa válida
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleTakeOrbitAgent(agent)}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
                  >
                    Tomar órbita
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExitOrbitAgent(agent)}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
                  >
                    Salir de órbita
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Aún no hay agentes guardados.
          </p>
        )}
      </section>
      <AgentLocationDebugPanel agents={sortedAgents} />
      {isMapOpen ? (
        <MapDialog
          point={mapPoint}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleConfirmBasePoint}
          onPointChange={setMapPoint}
        />
      ) : null}
      {editingAgent ? (
        <AgentEditDialog
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSaved={async () => {
            setAgents(await getAgents());
            setEditingAgent(null);
          }}
        />
      ) : null}
    </section>
  );
}

type InputProps = {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
};

function MapDialog({
  point,
  onPointChange,
  onConfirm,
  onClose
}: {
  point: { lat: number; lng: number };
  onPointChange: (point: { lat: number; lng: number }) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-hidden rounded-md border border-orbi-cyan/20 bg-orbi-panel shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-3xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Base operativa
            </p>
            <h3 className="mt-1 text-lg font-black text-orbi-text">Elegir base en mapa</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="h-[55vh] min-h-[320px]">
          <LocationPickerMap point={point} onPointChange={onPointChange} />
        </div>
        <div className="grid gap-2 border-t border-white/10 p-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow"
          >
            Confirmar base
          </button>
        </div>
      </section>
    </div>
  );
}

function AgentLocationDebugPanel({ agents }: { agents: OrbiAgent[] }) {
  return (
    <section className="rounded-md border border-amber-300/20 bg-amber-300/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">
        Debug temporal · ubicación agentes
      </p>
      <p className="mt-2 text-xs leading-5 text-orbi-muted">
        Fuente definitiva: operational_base_lat/operational_base_lng/radius_km. Si Supabase
        aún no tiene esas columnas, se muestra fallback temporal con lat/lng.
      </p>
      <div className="mt-4 space-y-3">
        {agents.length ? (
          agents.map((agent) => {
            const diagnostics = getAgentLocationDiagnostics(agent);

            return (
              <div
                key={agent.id}
                className="rounded-md border border-white/10 bg-orbi-black/45 p-3 text-xs leading-5 text-orbi-muted"
              >
                <div className="flex flex-wrap items-center gap-2 font-bold text-orbi-text">
                  <span>{agent.name}</span>
                  <span className="text-orbi-muted">id: {agent.id || "sin id"}</span>
                  <span>status: {agent.status}</span>
                  <span>is_on_orbit: {String(agent.isOnOrbit)}</span>
                  <span className={diagnostics.hasValidLocation ? "text-orbi-cyan" : "text-red-200"}>
                    hasValidLocation: {String(diagnostics.hasValidLocation)}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  <span>
                    operational_base_lat/lng:{" "}
                    {formatDebugPair(agent.operationalBaseLat, agent.operationalBaseLng)}
                  </span>
                  <span>current_lat/lng: {formatDebugPair(agent.currentLat, agent.currentLng)}</span>
                  <span>lat/lng: {formatDebugPair(agent.lat, agent.lng)}</span>
                  <span>radius_km: {agent.radiusKm ?? "null"}</span>
                </div>
                <p className="mt-2 text-amber-100">Resultado: {diagnostics.reason}</p>
                {diagnostics.fallbackWarning ? (
                  <p className="mt-1 text-amber-100">{diagnostics.fallbackWarning}</p>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-xs text-orbi-muted">No hay agentes cargados para auditar.</p>
        )}
      </div>
    </section>
  );
}

function AgentEditDialog({
  agent,
  onClose,
  onSaved
}: {
  agent: OrbiAgent;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [agentId] = useState(agent.id);
  const initialLocation = getAgentLocation(agent);
  const [name, setName] = useState(agent.name);
  const [photoUrl, setPhotoUrl] = useState(agent.photoUrl);
  const [serviceType, setServiceType] = useState<AgentServiceType>(agent.serviceType);
  const [zone, setZone] = useState(agent.operationalBaseText || agent.zone);
  const [lat, setLat] = useState(initialLocation ? String(initialLocation.lat) : "");
  const [lng, setLng] = useState(initialLocation ? String(initialLocation.lng) : "");
  const [radius, setRadius] = useState(String(agent.radiusKm || 20));
  const [phone, setPhone] = useState(agent.phone);
  const [vehicle, setVehicle] = useState(agent.vehicle);
  const [availabilityStart, setAvailabilityStart] = useState(getAvailabilityParts(agent.availability).start);
  const [availabilityEnd, setAvailabilityEnd] = useState(getAvailabilityParts(agent.availability).end);
  const [description, setDescription] = useState(agent.description);
  const [trustLevel, setTrustLevel] = useState<AgentTrustLevel>(agent.trustLevel);
  const [status, setStatus] = useState<AgentStatus>(agent.status);
  const [isOnOrbit, setIsOnOrbit] = useState(agent.isOnOrbit);
  const [mapPoint, setMapPoint] = useState({
    lat: initialLocation?.lat ?? zumpahuacanCenter.lat,
    lng: initialLocation?.lng ?? zumpahuacanCenter.lng
  });
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleUseCurrentLocation() {
    setError("");

    try {
      const position = await getCurrentPosition();
      setLat(position.latitude.toFixed(6));
      setLng(position.longitude.toFixed(6));
      setZone("Ubicación actual del agente");
      setStatus(AGENT_STATUS.ONLINE);
      setIsOnOrbit(true);
    } catch {
      setIsOnOrbit(false);
      setError("No pudimos obtener la ubicación del agente. No se puede tomar órbita sin ubicación válida.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedLat = parseOptionalNumber(lat);
    const parsedLng = parseOptionalNumber(lng);

    if (!hasValidAgentId({ id: agentId })) {
      setError("Este agente no tiene ID real de Supabase. Recarga la lista.");
      return;
    }

    if (isOnOrbit && !hasValidCoordinates(parsedLat, parsedLng)) {
      setError("No puedes dejar al agente en órbita sin una ubicación operativa válida.");
      return;
    }

    if (availabilityStart && availabilityEnd && availabilityStart >= availabilityEnd) {
      setError("La hora fin debe ser posterior a la hora inicio.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await updateAgent(agentId, {
        ...agent,
        name,
        photoUrl,
        initials: getAgentInitials(name),
        serviceType,
        zone,
        status,
        isOnOrbit,
        trustLevel,
        phone,
        description,
        vehicle,
        availability: formatAvailability(availabilityStart, availabilityEnd),
        lat: parsedLat,
        lng: parsedLng,
        currentLat: isOnOrbit ? parsedLat : null,
        currentLng: isOnOrbit ? parsedLng : null,
        latitude: agent.latitude,
        longitude: agent.longitude,
        operationalBaseLat: parsedLat,
        operationalBaseLng: parsedLng,
        operationalBaseText: zone,
        radiusKm: Number(radius)
      });
      await onSaved();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No fue posible editar el agente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-md border border-orbi-cyan/20 bg-orbi-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Editar agente
            </p>
            <h3 className="mt-1 text-xl font-black text-orbi-text">{agent.name}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
          <ControlledInput label="Nombre" value={name} onChange={setName} />
          <ControlledInput label="Foto URL" value={photoUrl} onChange={setPhotoUrl} required={false} />
          <SelectInput label="Servicio" value={serviceType} onChange={(value) => setServiceType(value as AgentServiceType)} options={agentServiceTypes} />
          <SelectInput label="Nivel" value={trustLevel} onChange={(value) => setTrustLevel(value as AgentTrustLevel)} options={agentLevels} />
          <div className="space-y-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4 sm:col-span-2">
            <p className="text-sm font-black text-orbi-text">Zona/base operativa</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setIsMapOpen(true)}
                className="min-h-11 w-full rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan"
              >
                Elegir base en mapa
              </button>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="min-h-11 w-full rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan"
              >
                Usar mi ubicación y tomar órbita
              </button>
            </div>
            <div className="rounded-md border border-white/10 bg-orbi-black/35 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">
                Base operativa
              </p>
              <p className="mt-1 text-sm font-semibold text-orbi-text">{zone}</p>
              {hasValidCoordinates(parseOptionalNumber(lat), parseOptionalNumber(lng)) ? (
                <p className="mt-1 text-xs text-orbi-muted">
                  {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
                </p>
              ) : null}
            </div>
          </div>
          <SelectInput label="Radio operativo" value={radius} onChange={setRadius} options={radiusOptions.map(String)} suffix=" km" />
          <ControlledInput label="Latitud base" value={lat} onChange={setLat} required={false} />
          <ControlledInput label="Longitud base" value={lng} onChange={setLng} required={false} />
          <ControlledInput label="Teléfono" value={phone} onChange={setPhone} />
          <ControlledInput label="Vehículo" value={vehicle} onChange={setVehicle} required={false} />
          <TimeSelect label="Hora inicio" value={availabilityStart} onChange={setAvailabilityStart} required={false} />
          <TimeSelect label="Hora fin" value={availabilityEnd} onChange={setAvailabilityEnd} required={false} />
          <SelectInput label="Estado" value={status} onChange={(value) => setStatus(value as AgentStatus)} options={[AGENT_STATUS.ONLINE, AGENT_STATUS.OFFLINE]} />
          <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
            Descripción
            <textarea className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none" value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          {error ? <p className="rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm font-bold text-red-100 sm:col-span-2">{error}</p> : null}
          <button type="submit" disabled={isSaving} className="min-h-12 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow sm:col-span-2">
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
        {isMapOpen ? (
          <MapDialog
            point={mapPoint}
            onPointChange={setMapPoint}
            onClose={() => setIsMapOpen(false)}
            onConfirm={() => {
              void (async () => {
                setLat(mapPoint.lat.toFixed(6));
                setLng(mapPoint.lng.toFixed(6));
                setZone(await getBaseLabel(mapPoint));
              })();
              setIsMapOpen(false);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function Input({
  label,
  name,
  placeholder,
  type = "text",
  required = true,
  defaultValue,
  value,
  onChange
}: InputProps) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        name={name}
        placeholder={placeholder}
        type={type}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required={required}
      />
    </label>
  );
}

function ControlledInput({
  label,
  value,
  onChange,
  required = true,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  suffix = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  suffix?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <select
        className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {suffix}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimeSelect({
  label,
  value,
  onChange,
  required = true
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <select
        className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
        value={value}
        onChange={(event) => onChange(normalizeTimeToHHmm(event.target.value))}
        required={required}
      >
        <option value="">Selecciona hora</option>
        {timeOptions.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
    </label>
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

function parseOptionalNumber(value: FormDataEntryValue | string | null) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function hasValidCoordinates(lat: number | null, lng: number | null) {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  if (lat === 0 && lng === 0) {
    return false;
  }

  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function formatAvailability(start: string, end: string) {
  if (!start.trim() && !end.trim()) {
    return "";
  }

  return [normalizeTimeToHHmm(start), normalizeTimeToHHmm(end)].filter(Boolean).join(" - ");
}

function buildTimeOptions() {
  const options: string[] = [];

  for (let hour = 6; hour <= 23; hour += 1) {
    options.push(`${String(hour).padStart(2, "0")}:00`);

    if (hour !== 23) {
      options.push(`${String(hour).padStart(2, "0")}:30`);
    }
  }

  return options;
}

function getAvailabilityParts(availability: string) {
  const [start = "", end = ""] = splitAvailability(availability);

  return {
    start: normalizeTimeToHHmm(start),
    end: normalizeTimeToHHmm(end)
  };
}

function normalizeTimeToHHmm(value: string) {
  const rawValue = value.trim().toLowerCase();
  if (!rawValue) {
    return "";
  }

  const normalizedMeridiem = rawValue
    .replace(/\s+/g, " ")
    .replace(/(^|\s)a\.?\s*m\.?(?=\s|$)/g, "$1am")
    .replace(/(^|\s)p\.?\s*m\.?(?=\s|$)/g, "$1pm");
  const meridiemMatch = normalizedMeridiem.match(/^(\d{1,2}):([0-5]\d)\s*(am|pm)$/);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = meridiemMatch[2];
    const meridiem = meridiemMatch[3];

    if (hours < 1 || hours > 12) {
      return "";
    }

    if (meridiem === "am" && hours === 12) {
      hours = 0;
    } else if (meridiem === "pm" && hours !== 12) {
      hours += 12;
    }

    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  const cleanMatch = normalizedMeridiem.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!cleanMatch) {
    return "";
  }

  return `${cleanMatch[1].padStart(2, "0")}:${cleanMatch[2]}`;
}

function splitAvailability(availability: string) {
  const rangeMatch = availability.match(/(.+?)\s+-\s+(.+)/);
  if (rangeMatch) {
    return [rangeMatch[1], rangeMatch[2]];
  }

  return [availability, ""];
}

function getCurrentPosition() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Tu navegador no permite obtener ubicación."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      reject,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function getBaseLabel(point: { lat: number; lng: number }) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        point.lat
      )}&lon=${encodeURIComponent(point.lng)}`
    );

    if (!response.ok) {
      throw new Error("No fue posible leer la base.");
    }

    const result = (await response.json()) as {
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
    const address = result.address ?? {};

    return (
      address.neighbourhood ||
      address.suburb ||
      address.village ||
      address.town ||
      address.city ||
      address.municipality ||
      address.county ||
      result.display_name ||
      "Base operativa válida"
    );
  } catch {
    return "Base operativa válida";
  }
}

function getAgentLocationBadge(agent: OrbiAgent) {
  const location = getAgentLocation(agent);
  const label = agent.operationalBaseText || (location?.source === "current" ? "Ubicación actual" : "Base operativa válida");

  return `Base operativa: ${label} · radio ${agent.radiusKm || 20} km`;
}

function formatDebugPair(lat: number | null, lng: number | null) {
  return `${lat ?? "null"}, ${lng ?? "null"}`;
}
