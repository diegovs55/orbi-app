"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole, LogOut } from "lucide-react";
import { AgentCards } from "@/components/AgentCards";
import { PageShell } from "@/components/PageShell";
import { clearAgentSession, getAgentSession, AgentSession } from "@/lib/agentSession";

export default function AgentePage() {
  const [session, setSession] = useState<AgentSession | null | "loading">("loading");

  useEffect(() => {
    setSession(getAgentSession());
  }, []);

  function handleLogout() {
    clearAgentSession();
    setSession(null);
  }

  if (session === "loading") return null;

  if (!session) {
    return (
      <PageShell
        eyebrow="Portal Agente"
        title="Acceso de agente."
        description="Inicia sesión para ver y gestionar misiones asignadas."
      >
        <div className="mt-8 flex max-w-sm flex-col gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.07] p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <LockKeyhole aria-hidden="true" className="h-5 w-5" />
          </span>
          <p className="text-sm text-orbi-muted">Debes iniciar sesión como agente para acceder a este panel.</p>
          <Link
            href="/agente/login"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
          >
            Iniciar sesión como agente
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Portal Agente"
      title="Tu centro de órbita y misiones Orbi."
      description="Recibe, acepta y administra misiones en tiempo real desde la red local."
    >
      <div className="mb-4 flex items-center justify-between rounded-md border border-orbi-cyan/15 bg-white/[0.04] px-4 py-3">
        <div>
          <p className="text-sm font-black text-orbi-text">{session.name}</p>
          <p className="text-xs text-orbi-muted">{session.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-orbi-muted transition hover:bg-white/10 hover:text-orbi-text"
        >
          <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
      <AgentCards agentId={session.id} />
    </PageShell>
  );
}
