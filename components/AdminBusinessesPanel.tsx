"use client";

import { Fragment, useEffect, useState } from "react";
import { Store, Trash2 } from "lucide-react";
import { AffiliateBusiness, getBusinesses, setBusinessStatus } from "@/lib/businesses";
import { subscribeToBusinesses } from "@/lib/supabase";

export function AdminBusinessesPanel() {
  const [businesses, setBusinesses] = useState<AffiliateBusiness[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
                <th className="w-[30%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Nombre</th>
                <th className="w-[22%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Categoría</th>
                <th className="w-[20%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Descripción</th>
                <th className="w-[10%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Estado</th>
                <th className="w-[18%] px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <Fragment key={b.id}>
                  <tr className="border-b border-white/[0.06]">
                    <td className="break-words px-3 py-3 font-semibold text-orbi-text">{b.name}</td>
                    <td className="px-3 py-3 text-xs text-orbi-muted">{b.category}</td>
                    <td className="truncate px-3 py-3 text-xs text-orbi-muted">{b.description || "—"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
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
                      <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-red-300">
                        {errors[b.id]}
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
