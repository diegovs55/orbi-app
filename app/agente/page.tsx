"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogOut } from "lucide-react";
import { AgentPrivatePanel } from "@/components/AgentPrivatePanel";
import { PageShell } from "@/components/PageShell";
import { clearAgentSession, getAgentSession, saveAgentSession, AgentSession } from "@/lib/agentSession";
import { getAgentByAuthUserId } from "@/lib/agents";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";

export default function AgentePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<AgentSession | null>(null);

  useEffect(() => {
    async function syncSession() {
      // Fast path: use localStorage cache if present
      const cached = getAgentSession();
      if (cached) {
        setSession(cached);
        setMounted(true);
        return;
      }

      // Slow path: recover from active Supabase JWT (new device / cleared cache)
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        // Redirect forced-change users who reached /agente directly
        if (data.user.user_metadata?.must_change_password) {
          router.replace("/agente/cambiar-contrasena");
          return;
        }
        const agent = await getAgentByAuthUserId(data.user.id);
        if (agent) {
          const s: AgentSession = {
            id: agent.id,
            name: agent.name,
            email: agent.email ?? data.user.email ?? "",
          };
          saveAgentSession(s);
          setSession(s);
        }
      }

      setMounted(true);
    }

    void syncSession();
  }, [router]);

  async function handleLogout() {
    clearAgentSession();
    await supabase.auth.signOut();
    router.push("/agentes");
  }

  if (!mounted) return null;

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
      <AgentPrivatePanel agentId={session.id} />
    </PageShell>
  );
}
