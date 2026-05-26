"use client";

import { ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAgents, OrbiAgent } from "@/lib/agents";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const statusStyles: Record<OrbiAgent["status"], string> = {
  Disponible: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  Ocupado: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
  "Fuera de servicio": "border-white/10 bg-white/5 text-orbi-muted"
};

export function AgentCards() {
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

          <a
            href={buildWhatsAppUrl(
              [
                "Solicitud de apoyo Orbi",
                `Agente: ${agent.name}`,
                `Servicio: ${agent.serviceType}`,
                `Zona: ${agent.zone}`,
                "Necesito apoyo con:"
              ].join("\n")
            )}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Solicitar apoyo
          </a>
        </article>
      ))}
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
