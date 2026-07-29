"use client";

import { useSyncExternalStore } from "react";
import { Network } from "lucide-react";
import { AdminIntelligenceOffer } from "@/components/AdminIntelligenceOffer";
import { AdminIntelligenceActivity } from "@/components/AdminIntelligenceActivity";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

function readAdminSession() {
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function subscribeToAdminSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("orbi-admin-session-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("orbi-admin-session-change", callback);
  };
}

export function AdminIntelligence() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);

  if (!isUnlocked) return null;

  return (
    <section className="mt-10 space-y-5">
      {/* Section header */}
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Inteligencia de la red
        </p>
        <h2 className="text-xl font-black text-orbi-text">
          ¿Qué ofrece la red?
        </h2>
      </div>

      {/* Icon + description */}
      <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.06] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <Network aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-orbi-text">Fase 2.4A — Oferta disponible</p>
            <p className="mt-0.5 text-xs text-orbi-muted">
              Vista de solo lectura. Muestra únicamente datos reales registrados en Supabase.
              No genera ni infiere información nueva.
            </p>
          </div>
        </div>
      </div>

      <AdminIntelligenceOffer />

      {/* ── Fase 2.4B — Actividad económica ─────────────────────────────── */}
      <div className="mt-8 space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Actividad económica
        </p>
        <h2 className="text-xl font-black text-orbi-text">
          ¿Qué actividad económica generó la red?
        </h2>
      </div>

      <AdminIntelligenceActivity />
    </section>
  );
}
