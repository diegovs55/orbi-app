"use client";

import { Fragment, useEffect, useState } from "react";
import { Copy, KeyRound, RotateCcw, Store, Trash2 } from "lucide-react";
import { AffiliateBusiness, getBusinesses, setBusinessStatus } from "@/lib/businesses";
import { subscribeToBusinesses } from "@/lib/supabase";

type CredResult = { email: string; tempPassword: string; action: "activated" | "reset" };

export function AdminBusinessesPanel() {
  const [businesses, setBusinesses] = useState<AffiliateBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const [resetting, setResetting] = useState<Set<string>>(new Set());
  const [credResults, setCredResults] = useState<Record<string, CredResult>>({});
  const [editingEmail, setEditingEmail] = useState<Record<string, string>>({});
  const [savingEmail, setSavingEmail] = useState<Set<string>>(new Set());

  async function load() {
    try {
      setBusinesses(await getBusinesses());
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return subscribeToBusinesses(() => void load());
  }, []);

  async function handleToggle(b: AffiliateBusiness) {
    try {
      await setBusinessStatus(b.id, b.status === "activo" ? "inactivo" : "activo");
      await load();
    } catch (err) {
      setErrors((p) => ({ ...p, [b.id]: err instanceof Error ? err.message : "Error" }));
    }
  }

  async function handleDelete(b: AffiliateBusiness) {
    try {
      await setBusinessStatus(b.id, "inactivo");
      await load();
    } catch (err) {
      setErrors((p) => ({
        ...p,
        [b.id]: err instanceof Error ? err.message : "Error al eliminar",
      }));
    }
  }

  async function handleSaveEmail(b: AffiliateBusiness) {
    const email = editingEmail[b.id]?.trim();
    if (!email) return;
    setSavingEmail((p) => new Set(p).add(b.id));
    setErrors((p) => { const n = { ...p }; delete n[b.id]; return n; });
    try {
      const res = await fetch("/api/businesses/set-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: b.id, email }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el correo.");
      setEditingEmail((p) => { const n = { ...p }; delete n[b.id]; return n; });
      await load();
    } catch (err) {
      setErrors((p) => ({ ...p, [b.id]: err instanceof Error ? err.message : "Error al guardar correo" }));
    } finally {
      setSavingEmail((p) => { const n = new Set(p); n.delete(b.id); return n; });
    }
  }

  async function handleActivate(b: AffiliateBusiness) {
    if (activating.has(b.id)) return;
    setActivating((p) => new Set(p).add(b.id));
    setErrors((p) => { const n = { ...p }; delete n[b.id]; return n; });

    try {
      // Ensure email is persisted on the row first
      if (b.email) {
        await fetch("/api/businesses/set-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: b.id, email: b.email }),
        });
      }
      const res = await fetch("/api/businesses/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: b.id }),
      });
      const data = (await res.json()) as { tempPassword?: string; email?: string; error?: string; alreadyActivated?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Error al activar");
      if (data.alreadyActivated) {
        setErrors((p) => ({ ...p, [b.id]: "El negocio ya tiene acceso activo en Supabase Auth." }));
      } else if (data.tempPassword && data.email) {
        setCredResults((p) => ({ ...p, [b.id]: { email: data.email!, tempPassword: data.tempPassword!, action: "activated" } }));
        await load();
      }
    } catch (err) {
      setErrors((p) => ({ ...p, [b.id]: err instanceof Error ? err.message : "Error al activar" }));
    } finally {
      setActivating((p) => { const n = new Set(p); n.delete(b.id); return n; });
    }
  }

  async function handleReset(b: AffiliateBusiness) {
    if (resetting.has(b.id)) return;
    setResetting((p) => new Set(p).add(b.id));
    setErrors((p) => { const n = { ...p }; delete n[b.id]; return n; });
    setCredResults((p) => { const n = { ...p }; delete n[b.id]; return n; });

    try {
      const res = await fetch("/api/businesses/reset-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: b.id }),
      });
      const data = (await res.json()) as { tempPassword?: string; email?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al restablecer acceso");
      if (data.tempPassword && data.email) {
        setCredResults((p) => ({ ...p, [b.id]: { email: data.email!, tempPassword: data.tempPassword!, action: "reset" } }));
      }
    } catch (err) {
      setErrors((p) => ({ ...p, [b.id]: err instanceof Error ? err.message : "Error al restablecer" }));
    } finally {
      setResetting((p) => { const n = new Set(p); n.delete(b.id); return n; });
    }
  }

  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-center gap-3">
        <Store className="h-5 w-5 text-orbi-cyan" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-black text-orbi-text">Negocios operativos</h2>
          <p className="text-xs text-orbi-muted">Negocios activos en Supabase · Fuente única</p>
        </div>
      </div>

      {isLoading ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Cargando negocios...
        </p>
      ) : businesses.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Sin negocios activos en Supabase.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-white/10">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="w-[20%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Nombre</th>
                <th className="w-[18%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Correo</th>
                <th className="w-[14%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Categoría</th>
                <th className="w-[16%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Descripción</th>
                <th className="w-[8%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Estado</th>
                <th className="w-[8%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Auth</th>
                <th className="w-[16%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <Fragment key={b.id}>
                  <tr className="border-b border-white/[0.06]">
                    <td className="break-words px-3 py-3 font-semibold text-orbi-text">{b.name}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted">
                      {b.email ? (
                        <span className="break-all">{b.email}</span>
                      ) : editingEmail[b.id] !== undefined ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); void handleSaveEmail(b); }}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="email"
                            autoFocus
                            value={editingEmail[b.id]}
                            onChange={(e) => setEditingEmail((p) => ({ ...p, [b.id]: e.target.value }))}
                            placeholder="correo@negocio.com"
                            className="w-36 rounded border border-white/15 bg-orbi-black/60 px-2 py-1 text-xs text-orbi-text outline-none focus:border-orbi-cyan/50"
                          />
                          <button
                            type="submit"
                            disabled={savingEmail.has(b.id)}
                            className="rounded bg-orbi-blue px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            {savingEmail.has(b.id) ? "…" : "Guardar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingEmail((p) => { const n = { ...p }; delete n[b.id]; return n; })}
                            className="text-orbi-muted hover:text-orbi-text text-[11px]"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingEmail((p) => ({ ...p, [b.id]: "" }))}
                          className="text-yellow-300 underline text-[11px] hover:text-yellow-100"
                        >
                          + Agregar correo
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-orbi-muted">{b.category}</td>
                    <td className="truncate px-3 py-3 text-xs text-orbi-muted">{b.description || "—"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {b.authUserId ? (
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
                        {!b.authUserId ? (
                          <button
                            type="button"
                            disabled={activating.has(b.id)}
                            onClick={() => void handleActivate(b)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orbi-cyan/30 bg-orbi-blue/10 px-2.5 py-1 text-xs font-bold text-orbi-cyan disabled:opacity-50"
                          >
                            <KeyRound className="h-3 w-3" aria-hidden="true" />
                            {activating.has(b.id) ? "Activando…" : "Activar acceso"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={resetting.has(b.id)}
                            onClick={() => void handleReset(b)}
                            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-orange-400/30 bg-orange-400/10 px-2.5 py-1 text-xs font-bold text-orange-300 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            {resetting.has(b.id) ? "Restableciendo…" : "Restablecer acceso"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleToggle(b)}
                          className="inline-flex min-h-7 items-center rounded-md border border-yellow-300/30 bg-yellow-300/10 px-2.5 py-1 text-xs font-bold text-yellow-200"
                        >
                          {b.status === "activo" ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(b)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-md border border-red-400/20 bg-red-400/10 px-2.5 py-1 text-xs font-bold text-red-300"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {errors[b.id] ? (
                    <tr className="border-b border-red-400/20 bg-red-400/[0.05]">
                      <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-red-300">
                        {errors[b.id]}
                      </td>
                    </tr>
                  ) : null}
                  {credResults[b.id] ? (
                    <tr className="border-b border-orbi-cyan/10 bg-orbi-blue/[0.04]">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-bold text-orbi-cyan">
                              {credResults[b.id].action === "reset" ? "Acceso restablecido →" : "Acceso activado →"}
                            </span>
                            <CredChip label="Correo" value={credResults[b.id].email} />
                            <CredChip label="Contraseña temporal" value={credResults[b.id].tempPassword} />
                          </div>
                          <p className="text-[11px] font-bold text-yellow-200">
                            ⚠ Esta contraseña solo se muestra una vez. Compártela únicamente con el negocio por WhatsApp.
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
