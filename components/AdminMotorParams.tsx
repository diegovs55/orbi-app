"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";

interface Param {
  id: number;
  scope: string;
  key: string;
  value: number;
  unit: string;
  description: string | null;
  created_at: string;
}

interface HistoryRow {
  id: number;
  key: string;
  old_value: number | null;
  new_value: number;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

export function AdminMotorParams() {
  const [params, setParams]   = useState<Param[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Editing state
  const [editing, setEditing]   = useState<string | null>(null); // key being edited
  const [newValue, setNewValue] = useState("");
  const [reason, setReason]     = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res  = await adminFetch("/api/admin/motor-params?scope=zumpahuacan");
      const data = await res.json() as { params: Param[]; history: HistoryRow[] };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error desconocido");
      setParams(data.params);
      setHistory(data.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar parámetros.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(p: Param) {
    setEditing(p.key);
    setNewValue(String(p.value));
    setReason("");
    setSaveError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setNewValue("");
    setReason("");
    setSaveError(null);
  }

  async function save(p: Param) {
    const parsed = Number(newValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSaveError("El valor debe ser un número positivo.");
      return;
    }
    if (!reason.trim()) {
      setSaveError("La razón del cambio es obligatoria.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await adminFetch("/api/admin/motor-params", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: p.scope, key: p.key, value: parsed, reason: reason.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al guardar.");
      cancelEdit();
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
        <p className="text-xs text-orbi-muted">Cargando parámetros del motor…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-md border border-red-500/30 bg-orbi-panel/72 p-4 shadow-soft">
        <p className="text-xs text-red-400">{error}</p>
        <button onClick={() => void load()} className="mt-2 text-xs text-orbi-cyan underline">
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">

      {/* ── Parámetros activos ── */}
      <div className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Motor Económico
            </p>
            <h3 className="mt-0.5 text-sm font-black text-orbi-text">
              Parámetros activos — Zumpahuacán
            </h3>
          </div>
          <button
            onClick={() => void load()}
            className="text-xs text-orbi-muted underline hover:text-orbi-cyan"
          >
            Actualizar
          </button>
        </div>

        <div className="divide-y divide-orbi-cyan/10">
          {params.map((p) => (
            <div key={p.key} className="py-3">
              {editing === p.key ? (
                /* ── Modo edición ── */
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono text-orbi-muted">{p.key}</p>
                      <p className="text-xs text-orbi-muted">{p.description}</p>
                    </div>
                    <span className="text-xs text-orbi-muted">{p.unit}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="w-28 rounded border border-orbi-cyan/30 bg-orbi-black px-2 py-1 text-sm text-orbi-text focus:border-orbi-cyan focus:outline-none"
                      autoFocus
                    />
                    <span className="self-center text-xs text-orbi-muted">{p.unit}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="Razón del cambio (obligatoria)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded border border-orbi-cyan/30 bg-orbi-black px-2 py-1 text-xs text-orbi-text placeholder-orbi-muted focus:border-orbi-cyan focus:outline-none"
                  />
                  {saveError && (
                    <p className="text-xs text-red-400">{saveError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void save(p)}
                      disabled={saving}
                      className="rounded bg-orbi-cyan px-3 py-1 text-xs font-bold text-orbi-black disabled:opacity-50"
                    >
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="text-xs text-orbi-muted underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Modo lectura ── */
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-orbi-muted">{p.key}</p>
                    <p className="truncate text-xs text-orbi-muted">{p.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-orbi-text">
                      {p.value} <span className="text-xs font-normal text-orbi-muted">{p.unit}</span>
                    </span>
                    <button
                      onClick={() => startEdit(p)}
                      className="text-xs text-orbi-cyan underline hover:opacity-80"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Historial de cambios ── */}
      {history.length > 0 && (
        <div className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
            Historial de cambios
          </p>
          <div className="divide-y divide-orbi-cyan/10">
            {history.map((h) => (
              <div key={h.id} className="py-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-orbi-muted">{h.key}</span>
                  <span className="shrink-0 text-orbi-muted">
                    {new Date(h.changed_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 text-orbi-text">
                  {h.old_value ?? "—"} → {h.new_value}
                </p>
                {h.reason && (
                  <p className="mt-0.5 italic text-orbi-muted">"{h.reason}"</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </section>
  );
}
