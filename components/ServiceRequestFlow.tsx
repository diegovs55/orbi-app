"use client";

import {
  ClipboardList,
  CreditCard,
  MapPin,
  PackageCheck,
  RefreshCw,
  Send,
  ShoppingBag,
  Truck,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AgentServiceType, getAgents, OrbiAgent } from "@/lib/agents";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const services = [
  {
    label: "Mandado",
    compatibleType: "Mandados",
    description: "Vueltas rápidas, recados y apoyo local.",
    icon: ClipboardList
  },
  {
    label: "Entrega",
    compatibleType: "Entregas",
    description: "Mover productos, paquetes o documentos.",
    icon: Truck
  },
  {
    label: "Traslado",
    compatibleType: "Traslados",
    description: "Coordinar movilidad punto a punto.",
    icon: MapPin
  },
  {
    label: "Compra local",
    compatibleType: "Compras",
    description: "Comprar en comercios cercanos por ti.",
    icon: ShoppingBag
  },
  {
    label: "Recolección",
    compatibleType: "Recolecciones",
    description: "Recoger artículos y llevarlos a destino.",
    icon: PackageCheck
  },
  {
    label: "Pago o trámite",
    compatibleType: "Mandados",
    description: "Pagos, filas, gestiones y vueltas.",
    icon: CreditCard
  }
] as const;

type ServiceOption = (typeof services)[number];

type RequestDetails = {
  origin: string;
  destination: string;
  detail: string;
  desiredTime: string;
  requesterName: string;
  requesterPhone: string;
};

const emptyDetails: RequestDetails = {
  origin: "",
  destination: "",
  detail: "",
  desiredTime: "",
  requesterName: "",
  requesterPhone: ""
};

const statusStyles: Record<OrbiAgent["status"], string> = {
  Disponible: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  Ocupado: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-white/10 bg-white/5 text-orbi-muted"
};

export function ServiceRequestFlow() {
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [details, setDetails] = useState<RequestDetails>(emptyDetails);
  const [isRequestReady, setIsRequestReady] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<OrbiAgent | null>(null);
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [agentError, setAgentError] = useState("");

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      if (!isActive) {
        return;
      }

      setAgentError("La consulta de agentes tardó demasiado. Revisa la conexión con Supabase.");
      setIsLoadingAgents(false);
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
            : "No fue posible cargar agentes compatibles."
        );
      })
      .finally(() => {
        if (isActive) {
          window.clearTimeout(timeoutId);
          setIsLoadingAgents(false);
        }
      });

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const compatibleAgents = useMemo(() => {
    if (!selectedService) {
      return [];
    }

    return agents.filter(
      (agent) =>
        agent.serviceType === (selectedService.compatibleType as AgentServiceType) &&
        agent.status === "Disponible"
    );
  }, [agents, selectedService]);

  function resetFlow() {
    setSelectedService(null);
    setDetails(emptyDetails);
    setIsRequestReady(false);
    setSelectedAgent(null);
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRequestReady(true);
  }

  function updateDetails(field: keyof RequestDetails, value: string) {
    setDetails((currentDetails) => ({ ...currentDetails, [field]: value }));
  }

  function sendWhatsApp() {
    if (!selectedService || !selectedAgent) {
      return;
    }

    const message = [
      "Solicitud Orbi",
      `Servicio: ${selectedService.label}`,
      `Origen: ${details.origin}`,
      `Destino: ${details.destination}`,
      `Detalle: ${details.detail}`,
      `Horario: ${details.desiredTime}`,
      `Solicitante: ${details.requesterName}`,
      `Teléfono: ${details.requesterPhone}`,
      `Agente seleccionado: ${selectedAgent.name}`,
      `Zona del agente: ${selectedAgent.zone}`
    ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-5">
      <StepHeader
        selectedService={selectedService}
        isRequestReady={isRequestReady}
        selectedAgent={selectedAgent}
      />

      {!selectedService ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <button
                key={service.label}
                type="button"
                onClick={() => setSelectedService(service)}
                className="group rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 text-left shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] transition hover:-translate-y-0.5 hover:border-orbi-cyan/35"
              >
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)]">
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <span className="block text-xl font-black text-orbi-text">{service.label}</span>
                <span className="mt-2 block text-sm leading-6 text-orbi-muted">
                  {service.description}
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      {selectedService && !isRequestReady ? (
        <form
          onSubmit={handleDetailsSubmit}
          className="grid gap-4 rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:grid-cols-2 sm:p-6"
        >
          <SelectedService service={selectedService} onReset={resetFlow} />
          <RequestInput
            label="Punto de origen"
            value={details.origin}
            placeholder="Dirección o referencia de salida"
            onChange={(value) => updateDetails("origin", value)}
          />
          <RequestInput
            label="Punto de destino"
            value={details.destination}
            placeholder="Dirección o referencia de llegada"
            onChange={(value) => updateDetails("destination", value)}
          />
          <RequestInput
            label="Horario deseado"
            value={details.desiredTime}
            placeholder="Hoy 5:30 PM"
            onChange={(value) => updateDetails("desiredTime", value)}
          />
          <RequestInput
            label="Nombre del solicitante"
            value={details.requesterName}
            placeholder="Tu nombre"
            onChange={(value) => updateDetails("requesterName", value)}
          />
          <RequestInput
            label="Teléfono del solicitante"
            value={details.requesterPhone}
            placeholder="55 0000 0000"
            onChange={(value) => updateDetails("requesterPhone", value)}
          />
          <label className="block text-sm font-semibold text-orbi-text sm:col-span-2">
            Detalle de la solicitud
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15"
              value={details.detail}
              placeholder="Describe qué necesitas, instrucciones, referencias o notas importantes"
              onChange={(event) => updateDetails("detail", event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0] sm:col-span-2"
          >
            Ver agentes compatibles
          </button>
        </form>
      ) : null}

      {selectedService && isRequestReady && !selectedAgent ? (
        <section className="space-y-4">
          <SelectedService
            service={selectedService}
            onReset={() => {
              setIsRequestReady(false);
              setSelectedAgent(null);
            }}
            actionLabel="Editar solicitud"
          />

          {isLoadingAgents ? (
            <StateCard title="Buscando agentes compatibles..." body="Estamos revisando disponibilidad en Red Orbi." />
          ) : agentError ? (
            <StateCard title="No pudimos cargar agentes." body={agentError} tone="error" />
          ) : compatibleAgents.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {compatibleAgents.map((agent) => (
                <AgentOptionCard
                  key={agent.id}
                  agent={agent}
                  onSelect={() => setSelectedAgent(agent)}
                />
              ))}
            </div>
          ) : (
            <StateCard
              title="No hay agentes disponibles para este servicio."
              body="Puedes ajustar la solicitud o intentar más tarde mientras se libera la red."
            />
          )}
        </section>
      ) : null}

      {selectedService && selectedAgent ? (
        <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Confirmar ficha
          </p>
          <h2 className="mt-2 text-2xl font-black text-orbi-text">Solicitud lista para enviar</h2>
          <div className="mt-5 grid gap-3 text-sm text-orbi-muted sm:grid-cols-2">
            <SummaryItem label="Servicio" value={selectedService.label} />
            <SummaryItem label="Origen" value={details.origin} />
            <SummaryItem label="Destino" value={details.destination} />
            <SummaryItem label="Horario" value={details.desiredTime} />
            <SummaryItem label="Solicitante" value={details.requesterName} />
            <SummaryItem label="Teléfono" value={details.requesterPhone} />
            <SummaryItem label="Agente seleccionado" value={selectedAgent.name} />
            <SummaryItem label="Zona del agente" value={selectedAgent.zone} />
            <SummaryItem label="Detalle" value={details.detail} wide />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSelectedAgent(null)}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-orbi-text transition hover:bg-white/10"
            >
              Cambiar agente
            </button>
            <button
              type="button"
              onClick={sendWhatsApp}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
            >
              <Send aria-hidden="true" className="h-5 w-5" />
              Enviar solicitud por WhatsApp
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepHeader({
  selectedService,
  isRequestReady,
  selectedAgent
}: {
  selectedService: ServiceOption | null;
  isRequestReady: boolean;
  selectedAgent: OrbiAgent | null;
}) {
  const steps = [
    { label: "Servicio", active: true, done: Boolean(selectedService) },
    { label: "Ficha", active: Boolean(selectedService), done: isRequestReady },
    { label: "Agente", active: isRequestReady, done: Boolean(selectedAgent) },
    { label: "Confirmar", active: Boolean(selectedAgent), done: false }
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step) => (
        <div
          key={step.label}
          className={`rounded-md border px-2 py-2 text-center text-[11px] font-bold ${
            step.done || step.active
              ? "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan"
              : "border-white/10 bg-white/[0.03] text-orbi-muted"
          }`}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

function SelectedService({
  service,
  onReset,
  actionLabel = "Cambiar servicio"
}: {
  service: ServiceOption;
  onReset: () => void;
  actionLabel?: string;
}) {
  const Icon = service.icon;

  return (
    <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-4 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
              Necesidad seleccionada
            </p>
            <p className="mt-1 font-black text-orbi-text">{service.label}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-orbi-text transition hover:bg-white/10"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function AgentOptionCard({ agent, onSelect }: { agent: OrbiAgent; onSelect: () => void }) {
  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)]">
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
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
      >
        Elegir agente
      </button>
    </article>
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="font-semibold text-orbi-muted">{label}</p>
      <p className="mt-1 font-black text-orbi-text">{value}</p>
    </div>
  );
}

function SummaryItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">{label}</p>
      <p className="mt-1 font-semibold text-orbi-text">{value}</p>
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
        <RefreshCw aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-black tracking-normal text-orbi-text">{title}</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted sm:text-base">
        {body}
      </p>
    </div>
  );
}
