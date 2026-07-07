"use client";

import { Fragment, useEffect, useState } from "react";
import { Copy, KeyRound, RotateCcw, Trash2, UserRound } from "lucide-react";
import {
  AGENT_STATUS,
  getAgents,
  OrbiAgent,
  setAgentActiveStatus,
  deleteAgent,
  hasValidAgentId,
} from "@/lib/agents";
import { subscribeToAgents } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";

type CredResult = { email: string; tempPassword: string; action: "activated" | "reset" };

export function AdminAgentsPanel() {
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState<Set<string>>(new Set());
  const [credResults, setCredResults] = useState<Record<string, CredResult>>({});

  async function load() {
    try {
      setAgents(await getAgents());
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return subscribeToAgents(() => void load());
  }, []);

  async function handleToggle(agent: OrbiAgent) {
    const isOnline = agent.status === AGENT_STATUS.ONLINE;
    try {
      await setAgentActiveStatus(agent.id, !isOnline);
      await load();
    } catch (err) {
      setErrors((p) => ({ ...p, [agent.id]: err instanceof Error ? err.message : "Error" }));
    }
  }

  async function handleActivate(agent: OrbiAgent) {
    if (activating.has(agent.id)) return;
    setActivating((p) => new Set(p).add(agent.id));
    setErrors((p) => { const n = { ...p }; delete n[agent.id]; return n; });

    try {
      const res = await adminFetch("/api/agents/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = (await res.json()) as { tempPassword?: string; email?: string; error?: string; alreadyActivated?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Error al activar");
      if (data.alreadyActivated) {
        setErrors((p) => ({ ...p, [agent.id]: "El agente ya tiene acceso activo en Supabase Auth." }));
      } else if (data.tempPassword && data.email) {
        setCredResults((p) => ({ ...p, [agent.id]: { email: data.email!, tempPassword: data.tempPassword!, action: "activated" } }));
        await load();
      }
    } catch (err) {
      setErrors((p) => ({ ...p, [agent.id]: err instanceof Error ? err.message : "Error al activar" }));
    } finally {
      setActivating((p) => { const n = new Set(p); n.delete(agent.id); return n; });
    }
  }

  async function handleReset(agent: OrbiAgent) {
    if (resetting.has(agent.id)) return;
    setResetting((p) => new Set(p).add(agent.id));
    setErrors((p) => { const n = { ...p }; delete n[agent.id]; return n; });
    setCredResults((p) => { const n = { ...p }; delete n[agent.id]; return n; });

    try {
      const res = await adminFetch("/api/agents/reset-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      const data = (await res.json()) as { tempPassword?: string; email?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al restablecer acceso");
      if (data.tempPassword && data.email) {
        setCredResults((p) => ({ ...p, [agent.id]: { email: data.email!, tempPassword: data.tempPassword!, action: "reset" } }));
      }
    } catch (err) {
      setErrors((p) => ({ ...p, [agent.id]: err instanceof Error ? err.message : "Error al restablecer" }));
    } finally {
      setResetting((p) => { const n = new Set(p); n.delete(agent.id); return n; });
    }
  }

  async function handleDelete(agent: OrbiAgent) {
    try {
      await deleteAgent(agent.id);
      await load();
    } catch {
      // RLS blocks DELETE — fall back to deactivation
      try {
        await setAgentActiveStatus(agent.id, false);
        await load();
      } catch (err) {
        setErrors((p) => ({
          ...p,
          [agent.id]: err instanceof Error ? err.message : "Error al eliminar",
        }));
      }
    }
  }

  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-center gap-3">
        <UserRound className="h-5 w-5 text-orbi-cyan" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-black text-orbi-text">Agentes operativos</h2>
          <p className="text-xs text-orbi-muted">Agentes activos en Supabase · Fuente única</p>
        </div>
      </div>

      {isLoading ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Cargando agentes...
        </p>
      ) : agents.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Sin agentes activos en Supabase.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-white/10">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="w-[22%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Nombre</th>
                <th className="w-[22%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Correo</th>
                <th className="w-[16%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Teléfono</th>
                <th className="w-[16%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Servicio</th>
                <th className="w-[10%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Estado</th>
                <th className="w-[10%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Auth</th>
                <th className="w-[14%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <Fragment key={agent.id}>
                  <tr className="border-b border-white/[0.06]">
                    <td className="break-words px-3 py-3 font-semibold text-orbi-text">{agent.name}</td>
                    <td className="break-all px-3 py-3 text-xs text-orbi-muted">{agent.email || "—"}</td>
                    <td className="px-3 py-3 font-mono text-xs text-orbi-cyan">{agent.phone || "—"}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted">{agent.serviceType}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                          agent.status === AGENT_STATUS.ONLINE
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-white/[0.04] text-orbi-muted"
                        }`}
                      >
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {agent.authUserId ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-0.5 text-[10px] font-bold text-yellow-200">
                          Sin Auth
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!agent.authUserId ? (
                          <button
                            type="button"
                            disabled={activating.has(agent.id)}
                            onClick={() => void handleActivate(agent)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orbi-cyan/30 bg-orbi-blue/10 px-2.5 py-1 text-xs font-bold text-orbi-cyan disabled:opacity-50"
                          >
                            <KeyRound className="h-3 w-3" aria-hidden="true" />
                            {activating.has(agent.id) ? "Activando…" : "Activar acceso"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={resetting.has(agent.id)}
                            onClick={() => void handleReset(agent)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs font-bold text-orange-300 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            {resetting.has(agent.id) ? "Restableciendo…" : "Restablecer acceso"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!hasValidAgentId(agent)}
                          onClick={() => void handleToggle(agent)}
                          className="inline-flex min-h-7 items-center rounded-md border border-yellow-300/30 bg-yellow-300/10 px-2.5 py-1 text-xs font-bold text-yellow-200 disabled:opacity-50"
                        >
                          {agent.status === AGENT_STATUS.ONLINE ? "Desactivar" : "Habilitar"}
                        </button>
                        <button
                          type="button"
                          disabled={!hasValidAgentId(agent)}
                          onClick={() => void handleDelete(agent)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-md border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-xs font-bold text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {errors[agent.id] ? (
                    <tr className="border-b border-red-400/20 bg-red-400/[0.05]">
                      <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-red-300">
                        {errors[agent.id]}
                      </td>
                    </tr>
                  ) : null}
                  {credResults[agent.id] ? (
                    <tr className="border-b border-orbi-cyan/10 bg-orbi-blue/[0.04]">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-bold text-orbi-cyan">
                              {credResults[agent.id].action === "reset" ? "Acceso restablecido →" : "Acceso activado →"}
                            </span>
                            <CredChip label="Correo" value={credResults[agent.id].email} />
                            <CredChip label="Contraseña temporal" value={credResults[agent.id].tempPassword} />
                          </div>
                          <p className="text-[11px] font-bold text-yellow-200">
                            ⚠ Esta contraseña solo se muestra una vez. Compártela únicamente con el agente por WhatsApp.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CredChip({ label, value }: { label: string; value: string }) {
  function copy() {
    navigator.clipboard.writeText(value).catch(() => undefined);
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-2 py-1 font-mono">
      <span className="text-orbi-muted">{label}:</span>
      <span className="font-bold text-orbi-text">{value}</span>
      <button type="button" onClick={copy} title="Copiar" className="text-orbi-muted transition hover:text-orbi-cyan">
        <Copy aria-hidden="true" className="h-3 w-3" />
      </button>
    </span>
  );
}
