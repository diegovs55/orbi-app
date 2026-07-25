"use client";

import { Fragment, useEffect, useState } from "react";
import { Copy, KeyRound, RotateCcw, Trash2, UserRound } from "lucide-react";
import {
  AGENT_STATUS,
  getActiveAgents,
  getSuspendedAgents,
  OrbiAgent,
  deleteAgent,
  hasValidAgentId,
} from "@/lib/agents";
import { subscribeToAgents } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";

type CredResult = { email: string; tempPassword: string; action: "activated" | "reset" };

export function AdminAgentsPanel() {
  const [activeAgents, setActiveAgents] = useState<OrbiAgent[]>([]);
  const [suspendedAgents, setSuspendedAgents] = useState<OrbiAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState<Set<string>>(new Set());
  const [suspending, setSuspending] = useState<Set<string>>(new Set());
  const [credResults, setCredResults] = useState<Record<string, CredResult>>({});
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const [active, suspended] = await Promise.all([getActiveAgents(), getSuspendedAgents()]);
      setActiveAgents(active);
      setSuspendedAgents(suspended);
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

  async function handleSuspend(agent: OrbiAgent, action: "desactivar" | "reactivar") {
    if (suspending.has(agent.id)) return;
    setSuspending((p) => new Set(p).add(agent.id));
    setErrors((p) => { const n = { ...p }; delete n[agent.id]; return n; });

    try {
      const res = await adminFetch("/api/agents/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, action }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error al ${action}`);
      await load();
    } catch (err) {
      setErrors((p) => ({ ...p, [agent.id]: err instanceof Error ? err.message : `Error al ${action}` }));
    } finally {
      setSuspending((p) => { const n = new Set(p); n.delete(agent.id); return n; });
    }
  }

  async function handleDelete(agent: OrbiAgent) {
    try {
      await deleteAgent(agent.id);
      await load();
    } catch {
      setErrors((p) => ({ ...p, [agent.id]: "No fue posible eliminar al agente." }));
    }
  }

  const q = search.trim().toLowerCase();
  function matchAgent(a: OrbiAgent) {
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      (a.email ?? "").toLowerCase().includes(q) ||
      (a.phone ?? "").toLowerCase().includes(q)
    );
  }
  const filteredActive = activeAgents.filter(matchAgent);
  const filteredSuspended = suspendedAgents.filter(matchAgent);

  return (
    <div className="mt-10 space-y-8">
      {/* ── Barra de búsqueda ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="w-full max-w-sm rounded-md border border-white/10 bg-orbi-panel/80 px-3 py-2 text-xs text-orbi-text placeholder:text-orbi-muted/50 outline-none focus:border-orbi-cyan/40"
        />
        {q && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-xs text-orbi-muted hover:text-orbi-text"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* ── Agentes operativos ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <UserRound className="h-5 w-5 text-orbi-cyan" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-black text-orbi-text">Agentes operativos</h2>
            <p className="text-xs text-orbi-muted">Estado administrativo: activo</p>
          </div>
        </div>

        {isLoading ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            Cargando agentes...
          </p>
        ) : filteredActive.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
            {q ? "Sin coincidencias." : "Sin agentes operativos."}
          </p>
        ) : (
          <AgentTable
            agents={filteredActive}
            errors={errors}
            activating={activating}
            resetting={resetting}
            suspending={suspending}
            credResults={credResults}
            onActivate={handleActivate}
            onReset={handleReset}
            onSuspend={(a) => void handleSuspend(a, "desactivar")}
            onDelete={handleDelete}
            suspendLabel="Desactivar"
          />
        )}
      </section>

      {/* ── Agentes inactivos ─────────────────────────────────────────────── */}
      {!isLoading && suspendedAgents.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-orbi-muted" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-black text-orbi-text">Agentes inactivos</h2>
              <p className="text-xs text-orbi-muted">Estado administrativo: desactivado · No pueden aceptar misiones</p>
            </div>
          </div>
          {filteredSuspended.length === 0 && q ? (
            <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
              Sin coincidencias.
            </p>
          ) : (
          <AgentTable
            agents={filteredSuspended}
            errors={errors}
            activating={activating}
            resetting={resetting}
            suspending={suspending}
            credResults={credResults}
            onActivate={handleActivate}
            onReset={handleReset}
            onSuspend={(a) => void handleSuspend(a, "reactivar")}
            onDelete={handleDelete}
            suspendLabel="Reactivar"
          />
          )}
        </section>
      )}
    </div>
  );
}

// ── Tabla compartida ──────────────────────────────────────────────────────────

type AgentTableProps = {
  agents: OrbiAgent[];
  errors: Record<string, string>;
  activating: Set<string>;
  resetting: Set<string>;
  suspending: Set<string>;
  credResults: Record<string, CredResult>;
  onActivate: (a: OrbiAgent) => void;
  onReset: (a: OrbiAgent) => void;
  onSuspend: (a: OrbiAgent) => void;
  onDelete: (a: OrbiAgent) => void;
  suspendLabel: "Desactivar" | "Reactivar";
};

function AgentTable({
  agents, errors, activating, resetting, suspending, credResults,
  onActivate, onReset, onSuspend, onDelete, suspendLabel,
}: AgentTableProps) {
  return (
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
                        onClick={() => onActivate(agent)}
                        className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orbi-cyan/30 bg-orbi-blue/10 px-2.5 py-1 text-xs font-bold text-orbi-cyan disabled:opacity-50"
                      >
                        <KeyRound className="h-3 w-3" aria-hidden="true" />
                        {activating.has(agent.id) ? "Activando…" : "Activar acceso"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={resetting.has(agent.id)}
                        onClick={() => onReset(agent)}
                        className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs font-bold text-orange-300 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        {resetting.has(agent.id) ? "Restableciendo…" : "Restablecer acceso"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={suspending.has(agent.id) || !hasValidAgentId(agent)}
                      onClick={() => onSuspend(agent)}
                      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                        suspendLabel === "Reactivar"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                          : "border-yellow-300/30 bg-yellow-300/10 text-yellow-200"
                      }`}
                    >
                      {suspending.has(agent.id)
                        ? suspendLabel === "Reactivar" ? "Reactivando…" : "Desactivando…"
                        : suspendLabel}
                    </button>
                    <button
                      type="button"
                      disabled={!hasValidAgentId(agent)}
                      onClick={() => onDelete(agent)}
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
