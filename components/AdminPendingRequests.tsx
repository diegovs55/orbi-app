"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { PendingRequest, RequestStatus, mapRequestRow } from "@/lib/pendingRequests";
import { createCatalogBusiness } from "@/lib/catalog";
import { AgentStatus, createAgent, getAgentInitials } from "@/lib/agents";
import { adminFetch } from "@/lib/admin-fetch";

const POLL_INTERVAL_MS = 8_000;

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

type ApprovedCredentials = { email: string; password?: string; supabaseBusinessId?: string; supabaseAgentId?: string };

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchRequests(): Promise<PendingRequest[]> {
  const res = await fetch("/api/requests/list");
  if (!res.ok) return [];
  const rows = (await res.json()) as Parameters<typeof mapRequestRow>[0][];
  return rows.map(mapRequestRow);
}

async function apiUpdateRequest(id: string, status: RequestStatus): Promise<void> {
  await adminFetch("/api/requests/update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status }),
  });
}

async function apiDeleteRequest(id: string): Promise<void> {
  await adminFetch(`/api/requests/delete?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminPendingRequests() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approveErrors, setApproveErrors] = useState<Record<string, string>>({});
  const [credResults, setCredResults] = useState<Record<string, ApprovedCredentials>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchRequests().then(setRequests);
    pollRef.current = setInterval(() => {
      void fetchRequests().then(setRequests);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleApprove(r: PendingRequest) {
    if (approving.has(r.id)) return;
    setApproving((prev) => new Set(prev).add(r.id));

    if (r.type === "business") {
      setApproveErrors((prev) => { const next = { ...prev }; delete next[r.id]; return next; });
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
      let tempPassword: string | undefined;
      if (supabaseBusinessId) {
        try {
          const emailRes = await adminFetch("/api/businesses/set-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId: supabaseBusinessId, email: r.email }),
          });
          if (!emailRes.ok) throw new Error("No se pudo guardar el correo del negocio.");

          const activateRes = await adminFetch("/api/businesses/activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId: supabaseBusinessId }),
          });
          const activateData = (await activateRes.json()) as { tempPassword?: string; error?: string; alreadyActivated?: boolean };
          if (!activateRes.ok) throw new Error(activateData.error ?? "Error al activar negocio en Auth");
          tempPassword = activateData.alreadyActivated ? undefined : activateData.tempPassword;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al activar en Supabase Auth.";
          setApproveErrors((prev) => ({ ...prev, [r.id]: msg }));
          setApproving((prev) => { const next = new Set(prev); next.delete(r.id); return next; });
          return;
        }
      }
      setCredResults((prev) => ({ ...prev, [r.id]: { email: r.email, password: tempPassword, supabaseBusinessId } }));
      await apiUpdateRequest(r.id, "approved");
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
      let tempPassword: string | undefined;
      try {
        const activateRes = await adminFetch("/api/agents/activate", {
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
      setCredResults((prev) => ({ ...prev, [r.id]: { email: r.email, password: tempPassword, supabaseAgentId } }));
      await apiUpdateRequest(r.id, "approved");
    } else {
      await apiUpdateRequest(r.id, "approved");
    }

    setApproving((prev) => { const next = new Set(prev); next.delete(r.id); return next; });
    void fetchRequests().then(setRequests);
  }

  async function handleDeactivate(id: string) {
    await apiUpdateRequest(id, "rejected");
    void fetchRequests().then(setRequests);
  }

  async function handleDelete(id: string) {
    await apiDeleteRequest(id);
    void fetchRequests().then(setRequests);
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
              credResults={credResults}
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
              credResults={credResults}
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
  title, items, approving, approveErrors, credResults, onApprove, onDeactivate, onDelete
}: {
  title: string;
  items: PendingRequest[];
  approving: Set<string>;
  approveErrors: Record<string, string>;
  credResults: Record<string, ApprovedCredentials>;
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
            {items.map((r) => (
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
                          onClick={() => onDeactivate(r.id)}
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

                {r.status === "approved" && credResults[r.id] ? (
                  <tr className="border-b border-white/[0.04] bg-orbi-blue/[0.04]">
                    <td colSpan={7} className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="font-bold text-orbi-cyan">
                          {r.type === "agent" ? "Agente aprobado →" : "Credenciales →"}
                        </span>
                        <CredentialChip label="Correo" value={credResults[r.id].email} />
                        {credResults[r.id].password ? (
                          <CredentialChip label="Contraseña temporal" value={credResults[r.id].password!} />
                        ) : null}
                        {r.type === "agent" ? (
                          credResults[r.id].supabaseAgentId ? (
                            <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
                              Ficha en Supabase · El agente entra en /agentes con correo y contraseña
                            </span>
                          ) : (
                            <span className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[11px] font-bold text-yellow-200">
                              Sin ficha en Supabase · Reintenta aprobar
                            </span>
                          )
                        ) : credResults[r.id].supabaseBusinessId ? (
                          <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
                            Ficha en Supabase · El negocio entra en /negocios con correo y contraseña
                          </span>
                        ) : (
                          <span className="rounded-md border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[11px] font-bold text-yellow-200">
                            Sin ficha en Supabase · Reintenta aprobar
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
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
