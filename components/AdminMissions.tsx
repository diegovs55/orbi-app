"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, LocateFixed, XCircle } from "lucide-react";
import {
  ActiveMission,
  getActiveMission,
  missionStatuses,
  subscribeToMission,
  updateActiveMission
} from "@/lib/missions";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

export function AdminMissions() {
  const router = useRouter();
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [mission, setMission] = useState<ActiveMission | null>(() => getActiveMission());
  const [message, setMessage] = useState("");

  useEffect(() => {
    return subscribeToMission(() => setMission(getActiveMission()));
  }, []);

  function handleAcceptMission() {
    if (!mission) {
      return;
    }

    const nextMission = updateActiveMission({
      mission_status: "Misión aceptada",
      active_agent_id: mission.selected_agent_id,
      accepted_at: new Date().toISOString()
    });
    setMission(nextMission);
    setMessage("Misión aceptada. Ya estás en órbita.");
    router.push("/orbita");
  }

  function handleRejectMission() {
    const nextMission = updateActiveMission({ mission_status: "Cancelada" });
    setMission(nextMission);
    setMessage("Misión rechazada. La solicitud queda fuera de órbita.");
  }

  function handleMissionStatusChange(status: ActiveMission["mission_status"]) {
    const nextMission = updateActiveMission({ mission_status: status });
    setMission(nextMission);
    setMessage(`Estado actualizado: ${status}`);
  }

  if (!isUnlocked) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <LocateFixed aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-black text-orbi-text">Misiones para tomar</h2>
            <p className="mt-1 text-xs text-orbi-muted">
              Acepta misiones y avanza su estado dentro de Red Orbi.
            </p>
          </div>
        </div>
      </div>

      {!mission ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          No hay misión activa esperando en la red.
        </p>
      ) : (
        <article className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
                {mission.mission_status}
              </p>
              <h3 className="mt-1 text-xl font-black text-orbi-text">{mission.service_type}</h3>
            </div>
            <span className="rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
              {mission.estimated_orbit}
            </span>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Origen" value={mission.origin_text} />
            <Info label="Destino" value={mission.destination_text} />
            <Info label="Solicitante" value={mission.requester_name} />
            <Info label="Teléfono" value={mission.requester_phone} />
            <Info label="Método de pago" value={mission.payment_method} />
            <Info label="Estado de pago" value={mission.payment_status} />
            <Info label="Agente seleccionado" value={mission.selected_agent_name} />
            <Info label="Detalle" value={mission.detail} wide />
          </div>

          {message ? (
            <p className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-bold text-emerald-200">
              {message}
            </p>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {mission.mission_status === "Esperando confirmación del agente" ? (
              <>
                <button
                  type="button"
                  onClick={handleAcceptMission}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
                >
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  Aceptar misión
                </button>
                <button
                  type="button"
                  onClick={handleRejectMission}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-400/15"
                >
                  <XCircle aria-hidden="true" className="h-4 w-4" />
                  Rechazar misión
                </button>
              </>
            ) : null}
            <Link
              href="/orbita"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15"
            >
              Ver misión en órbita
            </Link>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {missionStatuses
              .filter((status) => status !== "Esperando confirmación del agente")
              .map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleMissionStatusChange(status)}
                  className={`min-h-10 rounded-md border px-3 py-2 text-xs font-bold transition ${
                    mission.mission_status === status
                      ? "border-orbi-cyan/45 bg-orbi-blue/20 text-orbi-cyan"
                      : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
                  }`}
                >
                  {status}
                </button>
              ))}
          </div>
        </article>
      )}
    </section>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 ${wide ? "sm:col-span-2" : ""}`}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-orbi-cyan">{label}</p>
      <p className="mt-1 font-semibold text-orbi-text">{value || "No especificado"}</p>
    </div>
  );
}

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
