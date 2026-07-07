"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ActiveMission,
  getActiveMissions,
  isMissionClosed,
  loadActiveMissionsFromSupabase,
  migrateActiveMission,
  subscribeToMission
} from "@/lib/missions";

const statusLabel: Record<string, string> = {
  por_tomar: "Esperando agente",
  aceptada: "Agente en camino",
  en_mision: "En misión"
};

export function ActiveMissionsWidget() {
  const [missions, setMissions] = useState<ActiveMission[]>([]);

  useEffect(() => {
    migrateActiveMission();
    const load = async () => {
      await loadActiveMissionsFromSupabase();
      setMissions(getActiveMissions().filter((m) => !isMissionClosed(m)));
    };
    void load();
    return subscribeToMission(() => void load());
  }, []);

  if (missions.length === 0) return null;

  return (
    <div className="relative mt-8 max-w-sm">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-orbi-cyan">
        Tus misiones activas
      </p>
      <div className="space-y-2">
        {missions.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md border border-orbi-cyan/15 bg-white/[0.04] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-orbi-text">{m.service_type}</p>
              <p className="text-xs font-semibold text-orbi-muted">
                {statusLabel[m.status] ?? m.status}
              </p>
            </div>
            <Link
              href={`/orbita/${m.id}`}
              className="shrink-0 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-3 py-1.5 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              Ver
            </Link>
          </div>
        ))}
      </div>
      {missions.length > 1 ? (
        <p className="mt-3 text-center text-xs text-orbi-muted">
          Tienes {missions.length} pedidos activos — selecciona uno para ver su detalle.
        </p>
      ) : null}
    </div>
  );
}
