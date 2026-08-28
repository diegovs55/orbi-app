"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogOut } from "lucide-react";
import { AgentPrivatePanel } from "@/components/AgentPrivatePanel";
import { SupportCard } from "@/components/SupportCard";
import { PushSetup } from "@/components/PushSetup";
import { PageShell } from "@/components/PageShell";
import { clearAgentSession, getAgentSession, saveAgentSession, AgentSession } from "@/lib/agentSession";
import { getAgentByAuthUserId } from "@/lib/agents";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";
import { stopGpsWatch } from "@/lib/agent-gps";
import { apiUrl } from "@/lib/api-url";

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
    stopGpsWatch();
    // PUSH-01b Fase A — best-effort acotado: deshabilitar token del dispositivo
    // mientras el JWT aún existe. Timeout de 3 s; el logout nunca queda bloqueado.
    // Segunda defensa: el próximo /api/push/register para este device_id limpia la asociación.
    const installationId = localStorage.getItem("orbi_installation_id");
    if (installationId) {
      const { data: { session: agentSession } } = await supabase.auth.getSession();
      if (agentSession?.access_token) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          await fetch(apiUrl("/api/push/unregister"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${agentSession.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ device_id: installationId }),
            signal: controller.signal,
          });
        } catch {
          // timeout, red caída o error — segunda defensa activa en próximo registro
        } finally {
          clearTimeout(timeout);
        }
      }
    }
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
        description=""
      >
        <div className="mt-8 flex max-w-sm flex-col gap-4 rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.07] p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <LockKeyhole aria-hidden="true" className="h-5 w-5" />
          </span>
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
      <div className="mb-6 flex items-center justify-between rounded-xl border border-white/[0.08] bg-gradient-to-b from-[rgba(8,20,36,0.72)] to-[rgba(5,7,13,0.82)] px-5 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div>
          <p className="text-base font-black tracking-tight text-orbi-text">{session.name}</p>
          <p className="mt-0.5 text-[11px] text-orbi-muted/65">{session.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs font-medium text-orbi-muted/55 transition hover:border-white/[0.15] hover:text-orbi-muted/85"
        >
          <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
      <PushSetup getAccessToken={async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      }} />
      <AgentPrivatePanel agentId={session.id} />
      <div className="mt-10">
        <SupportCard />
      </div>
    </PageShell>
  );
}
