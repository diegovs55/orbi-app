"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, UserRound } from "lucide-react";
import { AgentCards } from "@/components/AgentCards";
import { PageShell } from "@/components/PageShell";
import { getAgentSession } from "@/lib/agentSession";

export default function AgentesPage() {
  const [mounted, setMounted] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(getAgentSession() !== null);
    setMounted(true);
  }, []);

  return (
    <PageShell
      eyebrow="Agentes Orbi"
      title="Red de apoyo local visible y confiable."
      description="Consulta agentes, repartidores y prestadores registrados para coordinar mandados, entregas, traslados y recolecciones."
    >
      {mounted ? (
        <div className="flex justify-end">
          {hasSession ? (
            <Link
              href="/agente"
              className="inline-flex items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20"
            >
              <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
              Ir a mi panel
            </Link>
          ) : (
            <Link
              href="/agente/login"
              className="inline-flex items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20"
            >
              <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
              Entrar como agente
            </Link>
          )}
        </div>
      ) : null}
      <AgentCards />
    </PageShell>
  );
}
