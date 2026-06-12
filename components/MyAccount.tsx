"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import {
  clearCustomerSession,
  getCurrentCustomerSession,
  CustomerSession
} from "@/lib/customers";
import {
  ActiveMission,
  getActiveMissions,
  getMissionHistory,
  getMissionStatusLabel,
  isMissionClosed
} from "@/lib/missions";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MyAccount() {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [history, setHistory] = useState<ActiveMission[]>([]);
  const [active, setActive] = useState<ActiveMission[]>([]);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const s = getCurrentCustomerSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    if (s) {
      const phone = s.phone.replace(/\D/g, "");
      const hist = getMissionHistory().filter(
        (m) => (m.requester_phone ?? "").replace(/\D/g, "") === phone
      );
      setHistory(hist);
      const act = getActiveMissions().filter(
        (m) =>
          !isMissionClosed(m) &&
          (m.requester_phone ?? "").replace(/\D/g, "") === phone
      );
      setActive(act);
    }
  }, []);

  function handleClearSession() {
    clearCustomerSession();
    setSession(null);
    setHistory([]);
    setActive([]);
    setCleared(true);
  }

  if (cleared) {
    return (
      <div className="mt-8 rounded-md border border-white/10 bg-white/[0.04] p-6 text-center">
        <p className="text-sm font-semibold text-orbi-text">Sesión cerrada correctamente.</p>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mt-8 rounded-md border border-white/10 bg-white/[0.04] p-6 text-center">
        <p className="text-sm text-orbi-muted">
          No hay sesión guardada. Cuando hagas un pedido podrás guardar tu WhatsApp para ver tu historial aquí.
        </p>
        <Link
          href="/pedir"
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Hacer un pedido
        </Link>
      </div>
    );
  }

  return (
    <section className="mt-8 space-y-6">
      {/* Identity card */}
      <div className="flex items-start gap-4 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <UserRound aria-hidden="true" className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-black text-orbi-text">{session.name}</p>
          <p className="mt-0.5 font-mono text-xs font-bold text-orbi-cyan">{session.phone}</p>
          {session.email ? (
            <p className="mt-0.5 text-xs text-orbi-muted">{session.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClearSession}
          className="text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-red-400"
        >
          Cerrar sesión
        </button>
      </div>

      {/* Active missions */}
      {active.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Misiones activas
          </p>
          <div className="space-y-2">
            {active.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-orbi-text">{m.service_type}</p>
                  <p className="text-xs text-orbi-muted">{getMissionStatusLabel(m.status)}</p>
                </div>
                <Link
                  href="/orbita"
                  className="text-xs font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
                >
                  Ver en órbita
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mission history */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
          Historial de misiones
        </p>
        {history.length === 0 ? (
          <p className="text-sm text-orbi-muted">
            Aún no tienes misiones completadas asociadas a este número.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  {["Servicio", "Estado", "Destino", "Fecha"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-semibold text-orbi-text">{m.service_type}</td>
                    <td className="px-4 py-3 text-xs text-orbi-muted">
                      {getMissionStatusLabel(m.status)}
                    </td>
                    <td className="px-4 py-3 text-xs text-orbi-muted">
                      {m.destination_text || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-orbi-muted">
                      {m.last_updated_at ? formatDate(m.last_updated_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
