"use client";

import { Fragment, useEffect, useState } from "react";
import { Copy, Loader2, Trash2 } from "lucide-react";
import {
  getPendingRequests,
  subscribeToPendingRequests,
  updatePendingRequest,
  PendingRequest,
  RequestStatus
} from "@/lib/pendingRequests";
import { saveLocalBusinessAccount } from "@/lib/businessSession";
import { createCatalogBusiness } from "@/lib/catalog";
import { AgentStatus, createAgent, getAgentInitials } from "@/lib/agents";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      year: "numeric", month: "short", day: "numeric"
    }).format(new Date(iso));
  } catch { return iso; }
}

const statusLabel: Record<RequestStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada"
};

const statusStyle: Record<RequestStatus, string> = {
  pending: "border-yellow-300/20 bg-yellow-300/10 text-yellow-200",
  approved: "border-orbi-cyan/25 bg-orbi-blue/10 text-orbi-cyan",
  rejected: "border-red-400/20 bg-red-400/10 text-red-300"
};

export function AdminPendingRequests() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approveErrors, setApproveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setRequests(getPendingRequests());

    const load = () => setRequests(getPendingRequests());
    const unsub = subscribeToPendingRequests(load);
    return () => { unsub(); };
  }, []);

  async function handleApprove(r: PendingRequest) {
    if (approving.has(r.id)) return;
    setApproving((prev) => new Set(prev).add(r.id));

    if (r.type === "business") {
      const initialPassword = r.phone.replace(/\D/g, "") || "orbi1234";
      let supabaseBusinessId: string | undefined;
      try {
        const biz = await createCatalogBusiness({
          name: r.name,
          category: "Otro",
          zone: "",
          baseText: r.message || r.name,
          phone: r.phone,
          lat: null,
          lng: null,
          status: "activo",
          availability: "",
          availabilityStart: "",
          availabilityEnd: "",
          estimatedTime: "Dinámico",
          rating: null
        });
        supabaseBusinessId = biz.id;
      } catch {
        supabaseBusinessId = undefined;
      }
      saveLocalBusinessAccount(r.name, r.email, r.phone, initialPassword, supabaseBusinessId);
      updatePendingRequest(r.id, "approved", {
        approvedCredentials: { email: r.email, password: initialPassword, supabaseBusinessId }
      });
    } else if (r.type === "agent") {
      setApproveErrors((prev) => { const next = { ...prev }; delete next[r.id]; return next; });
      let supabaseAgentId: string | undefined;
      try {
        const newAgent = await createAgent({
          name: r.name,
          email: r.email,
          photoUrl: "",
          initials: getAgentInitials(r.name),
          serviceType: "Todos los servicios",
          zone: "Por definir",
          status: "Disponible" as AgentStatus,
          isOnOrbit: false,
          trustLevel: "Aprendiz",
          phone: r.phone,
          description: r.message || "",
          vehicle: "",
          availability: "",
          lat: null, lng: null,
          currentLat: null, currentLng: null,
          radiusKm: 20,
          authUserId: undefined,
        });
        supabaseAgentId = newAgent.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido al crear ficha en Supabase.";
        console.error("[agents] createAgent failed:", err);
        setApproveErrors((prev) => ({ ...prev, [r.id]: msg }));
        setApproving((prev) => { const next = new Set(prev); next.delete(r.id); return next; });
        return;
      }
      // Activate agent in Supabase Auth (generates temp password server-side)
      let tempPassword: string | undefined;
      try {
        const activateRes = await fetch("/api/agents/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: supabaseAgentId }),
        });
        const activateData = (await activateRes.json()) as { tempPassword?: string; error?: string; alreadyActivated?: boolean };
        if (!activateRes.ok) throw new Error(activateData.error ?? "Error al activar agente en Auth");
        tempPassword = activateData.alreadyActivated ? undefined : activateData.tempPassword;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al activar en Supabase Auth.";
        setApproveErrors((prev) => ({ ...prev, [r.id]: msg }));
        setApproving((prev) => { const next = new Set(prev); next.delete(r.id); return next; });
        return;
      }
      updatePendingRequest(r.id, "approved", {
        approvedCredentials: { email: r.email, password: tempPassword, supabaseAgentId }
      });
    } else {
      updatePendingRequest(r.id, "approved");
    }

    setApproving((prev) => {
      const next = new Set(prev);
      next.delete(r.id);
      return next;
    });
  }

  function handleDeactivate(id: string) {
    updatePendingRequest(id, "rejected");
  }

  function handleDelete(id: string) {
    const list = getPendingRequests().filter((r) => r.id !== id);
    window.localStorage.setItem("orbi_pending_requests", JSON.stringify(list));
    window.dispatchEvent(new Event("orbi-pending-requests-change"));
  }

  const agentReqs = requests.filter((r) => r.type === "agent" && r.status === "pending");
  const businessReqs = requests.filter((r) => r.type === "business" && r.status === "pending");
  const pendingCount = agentReqs.length + businessReqs.length;

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="text-lg font-black text-orbi-text">Solicitudes de alta</h2>
        <p className="text-xs text-orbi-muted">
          Agentes y negocios que solicitaron acceso a Red Orbi
          {pendingCount > 0 ? ` · ${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}` : ""}
        </p>
      </div>

      {agentReqs.length === 0 && businessReqs.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          No hay solicitudes pendientes.
        </p>
      ) : (
        <>
          {agentReqs.length > 0 && (
            <RequestGroup
              title="Agentes"
              items={agentReqs}
              approving={approving}
              approveErrors={approveErrors}
              onApprove={handleApprove}
              onDeactivate={handleDeactivate}
              onDelete={handleDelete}
            />
          )}
          {businessReqs.length > 0 && (
            <RequestGroup
              title="Negocios"
              items={businessReqs}
              approving={approving}
              approveErrors={{}}
              onApprove={handleApprove}
              onDeactivate={handleDeactivate}
              onDelete={handleDelete}
            />
          )}
        </>
      )}

    </section>
  );
}

// ── Request table ─────────────────────────────────────────────────────────────

function RequestGroup({
  title,
  items,
  approving,
  approveErrors,
  onApprove,
  onDeactivate,
  onDelete
}: {
  title: string;
  items: PendingRequest[];
  approving: Set<string>;
  approveErrors: Record<string, string>;
  onApprove: (r: PendingRequest) => void;
  onDeactivate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">{title}</p>
      <div className="rounded-md border border-white/10">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Nombre</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Correo</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Teléfono</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Descripción</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Fecha</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Estado</th>
              <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              return (
                <Fragment key={r.id}>
                  <tr className="border-b border-white/[0.06]">
                    <td className="px-3 py-3 font-semibold text-orbi-text break-words">{r.name}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted break-all">{r.email}</td>
                    <td className="px-3 py-3 font-mono text-xs text-orbi-cyan">{r.phone}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted truncate max-w-0">{r.message || "—"}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusStyle[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "pending" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApprove(r)}
                            disabled={approving.has(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-orbi-blue px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {approving.has(r.id) && (
                              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                            )}
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePendingRequest(r.id, "rejected")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-300"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                      {r.status === "approved" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onDeactivate(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-yellow-300/30 bg-yellow-300/10 px-3 py-1.5 text-xs font-bold text-yellow-200"
                          >
                            Desactivar
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-300"
                          >
                            <Trash2 aria-hidden="true" className="h-3 w-3" />
                            Eliminar
                          </button>
                        </div>
                      )}
                      {r.status === "rejected" && (
                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs font-bold text-red-300"
                        >
                          <Trash2 aria-hidden="true" className="h-3 w-3" />
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>

                  {approveErrors[r.id] ? (
                    <tr className="border-b border-red-400/20 bg-red-400/[0.05]">
                      <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-red-300">
                        Error al crear ficha: {approveErrors[r.id]}
                      </td>
                    </tr>
                  ) : null}

                  {r.status === "approved" && r.approvedCredentials ? (
                    <tr className="border-b border-white/[0.04] bg-orbi-blue/[0.04]">
                      <td colSpan={7} className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="font-bold text-orbi-cyan">
                            {r.type === "agent" ? "Agente aprobado →" : "Credenciales →"}
                          </span>
                          <CredentialChip label="Correo" value={r.approvedCredentials.email} />
                          {r.type === "business" && r.approvedCredentials.password ? (
                            <CredentialChip label="Contraseña" value={r.approvedCredentials.password} />
                          ) : null}
                          {r.type === "agent" ? (
                            <>
                              {r.approvedCredentials.password ? (
                                <CredentialChip label="Contraseña" value={r.approvedCredentials.password} />
                              ) : null}
                              {r.approvedCredentials.supabaseAgentId ? (
                                <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
                                  Ficha en Supabase · El agente entra en /agentes con correo y contraseña
                                </span>
                              ) : (
                                <span className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[11px] font-bold text-yellow-200">
                                  Sin ficha en Supabase · Reintenta aprobar
                                </span>
                              )}
                            </>
                          ) : r.approvedCredentials.supabaseBusinessId ? (
                            <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
                              Vinculado al catálogo
                            </span>
                          ) : (
                            <span className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[11px] font-bold text-yellow-200">
                              Sin vínculo Supabase
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CredentialChip({ label, value }: { label: string; value: string }) {
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
