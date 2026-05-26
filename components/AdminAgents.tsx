"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import {
  AgentServiceType,
  AgentStatus,
  AgentTrustLevel,
  OrbiAgent,
  agentServiceTypes,
  createAgent,
  deleteAgent,
  getAgentInitials,
  getAgents
} from "@/lib/agents";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

export function AdminAgents() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [agentError, setAgentError] = useState("");

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
    const initials = String(data.get("initials") ?? "").trim() || getAgentInitials(name);

    const newAgent = {
      name,
      photoUrl: String(data.get("photoUrl") ?? "").trim(),
      initials,
      serviceType: String(data.get("serviceType")) as AgentServiceType,
      zone: String(data.get("zone") ?? "").trim(),
      status: String(data.get("status")) as AgentStatus,
      trustLevel: String(data.get("trustLevel")) as AgentTrustLevel,
      phone: String(data.get("phone") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      vehicle: String(data.get("vehicle") ?? "").trim(),
      availability: String(data.get("availability") ?? "").trim()
    };

    if (!newAgent.name || !newAgent.zone || !newAgent.phone || !newAgent.description) {
      return;
    }

    setIsSaving(true);
    setAgentError("");

    try {
      const savedAgent = await createAgent(newAgent);
      setAgents((currentAgents) => [savedAgent, ...currentAgents]);
      form.reset();
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error ? caughtError.message : "No fue posible guardar el agente."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAgent(id: string) {
    setAgentError("");

    try {
      await deleteAgent(id);
      setAgents((currentAgents) => currentAgents.filter((agent) => agent.id !== id));
    } catch (caughtError) {
      setAgentError(
        caughtError instanceof Error ? caughtError.message : "No fue posible eliminar el agente."
      );
    }
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
        <Input label="Iniciales" name="initials" placeholder="DR" required={false} />
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
        <Input label="Zona principal de operación" name="zone" placeholder="Centro / Norte" />
        <label className="block text-sm font-semibold text-orbi-text">
          Estado
          <select
            name="status"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue="Disponible"
          >
            <option value="Disponible">Disponible</option>
            <option value="Ocupado">Ocupado</option>
            <option value="Fuera de servicio">Fuera de servicio</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-orbi-text">
          Nivel de confianza
          <select
            name="trustLevel"
            className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
            defaultValue="Verificado"
          >
            <option value="Verificado">Verificado</option>
            <option value="En validación">En validación</option>
          </select>
        </label>
        <Input label="Teléfono/WhatsApp interno" name="phone" placeholder="5255..." />
        <Input label="Placa o vehículo" name="vehicle" placeholder="Moto azul / ABC-123" required={false} />
        <Input label="Horario disponible" name="availability" placeholder="9:00–18:00" required={false} />
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
                    onClick={() => handleDeleteAgent(agent.id)}
                    aria-label={`Eliminar ${agent.name}`}
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
                    {agent.trustLevel}
                  </span>
                  {agent.vehicle ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-orbi-muted">
                      {agent.vehicle}
                    </span>
                  ) : null}
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
    </section>
  );
}

type InputProps = {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
};

function Input({ label, name, placeholder, required = true }: InputProps) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        name={name}
        placeholder={placeholder}
        required={required}
      />
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
