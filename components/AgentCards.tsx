"use client";

import { Send, ShieldCheck, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getAgents, OrbiAgent } from "@/lib/agents";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const statusStyles: Record<OrbiAgent["status"], string> = {
  Disponible: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  Ocupado: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-white/10 bg-white/5 text-orbi-muted"
};

const requestServiceTypes = ["Mandado", "Entrega", "Traslado", "Compra", "Recolección"] as const;

type AgentRequest = {
  serviceType: string;
  origin: string;
  destination: string;
  detail: string;
  desiredTime: string;
  requesterName: string;
  requesterPhone: string;
};

const emptyRequest: AgentRequest = {
  serviceType: "Mandado",
  origin: "",
  destination: "",
  detail: "",
  desiredTime: "",
  requesterName: "",
  requesterPhone: ""
};

export function AgentCards() {
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<OrbiAgent | null>(null);
  const [request, setRequest] = useState<AgentRequest>(emptyRequest);

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

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
  }, [agents]);

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
      <div className="grid gap-4 sm:grid-cols-2">
        {sortedAgents.map((agent) => (
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
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyles[agent.status]}`}
                  >
                    {agent.status}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-orbi-cyan">{agent.serviceType}</p>
                <p className="mt-2 text-sm leading-6 text-orbi-muted">{agent.description}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <InfoTile label="Zona" value={agent.zone} />
              <InfoTile label="Confianza" value={agent.trustLevel} />
              {agent.vehicle ? <InfoTile label="Vehículo" value={agent.vehicle} /> : null}
              {agent.availability ? <InfoTile label="Horario" value={agent.availability} /> : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedAgent(agent);
                setRequest(emptyRequest);
              }}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
            >
              Seleccionar agente
            </button>
          </article>
        ))}
      </div>

      {selectedAgent ? (
        <AgentRequestModal
          agent={selectedAgent}
          request={request}
          onChange={setRequest}
          onClose={() => setSelectedAgent(null)}
        />
      ) : null}
    </>
  );
}

function AgentRequestModal({
  agent,
  request,
  onChange,
  onClose
}: {
  agent: OrbiAgent;
  request: AgentRequest;
  onChange: (request: AgentRequest) => void;
  onClose: () => void;
}) {
  function updateField(field: keyof AgentRequest, value: string) {
    onChange({ ...request, [field]: value });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = [
      "Solicitud Orbi",
      `Servicio: ${request.serviceType}`,
      `Agente: ${agent.name}`,
      `Zona: ${agent.zone}`,
      `Origen: ${request.origin}`,
      `Destino: ${request.destination}`,
      `Detalle: ${request.detail}`,
      `Horario: ${request.desiredTime}`,
      `Solicitante: ${request.requesterName}`,
      `Teléfono: ${request.requesterPhone}`
    ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-orbi-black/75 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full overflow-y-auto rounded-md border border-orbi-cyan/20 bg-orbi-panel p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_45px_rgba(31,139,255,0.16)] sm:max-w-3xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Agente seleccionado
            </p>
            <div className="mt-3 flex items-center gap-3 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3">
              <AgentAvatar agent={agent} />
              <div>
                <h2 className="text-xl font-black text-orbi-text">{agent.name}</h2>
                <p className="mt-1 text-sm text-orbi-muted">
                  {agent.serviceType} · {agent.zone} · {agent.trustLevel}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar solicitud"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-orbi-text transition hover:bg-white/10"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-orbi-text">
            Tipo de servicio
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-orbi-black px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
              value={request.serviceType}
              onChange={(event) => updateField("serviceType", event.target.value)}
            >
              {requestServiceTypes.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {serviceType}
                </option>
              ))}
            </select>
          </label>
          <RequestInput
            label="Horario deseado"
            value={request.desiredTime}
            placeholder="Hoy 5:30 PM"
            onChange={(value) => updateField("desiredTime", value)}
          />
          <RequestInput
            label="Punto de origen"
            value={request.origin}
            placeholder="Dirección o referencia de salida"
            onChange={(value) => updateField("origin", value)}
          />
          <RequestInput
            label="Punto de destino"
            value={request.destination}
            placeholder="Dirección o referencia de llegada"
            onChange={(value) => updateField("destination", value)}
          />
          <RequestInput
            label="Nombre del solicitante"
            value={request.requesterName}
            placeholder="Tu nombre"
            onChange={(value) => updateField("requesterName", value)}
          />
          <RequestInput
            label="Teléfono del solicitante"
            value={request.requesterPhone}
            placeholder="55 0000 0000"
            onChange={(value) => updateField("requesterPhone", value)}
          />
          <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
            Detalle de la solicitud
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
              value={request.detail}
              placeholder="Describe qué necesitas, instrucciones, referencias o notas importantes"
              onChange={(event) => updateField("detail", event.target.value)}
              required
            />
          </label>
        </div>

        <div className="mt-5 rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
          <h3 className="font-black text-orbi-text">Resumen de solicitud</h3>
          <div className="mt-3 grid gap-2 text-sm text-orbi-muted sm:grid-cols-2">
            <SummaryItem label="Servicio" value={request.serviceType} />
            <SummaryItem label="Agente" value={agent.name} />
            <SummaryItem label="Zona" value={agent.zone} />
            <SummaryItem label="Origen" value={request.origin} />
            <SummaryItem label="Destino" value={request.destination} />
            <SummaryItem label="Horario" value={request.desiredTime} />
            <SummaryItem label="Solicitante" value={request.requesterName} />
            <SummaryItem label="Teléfono" value={request.requesterPhone} />
            <SummaryItem label="Detalle" value={request.detail} wide />
          </div>
        </div>

        <button
          type="submit"
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          <Send aria-hidden="true" className="h-5 w-5" />
          Enviar solicitud por WhatsApp
        </button>
      </form>
    </div>
  );
}

function RequestInput({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function SummaryItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="font-bold text-orbi-cyan">{label}: </span>
      <span>{value || "Pendiente"}</span>
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
