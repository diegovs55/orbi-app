"use client";

import { useEffect, useState } from "react";
import { UsersRound } from "lucide-react";
import { getCustomers, OrbiCustomer } from "@/lib/customers";
import { getActiveMissions, getMissionHistory, isMissionClosed } from "@/lib/missions";
import { subscribeToCustomers } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

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

function displayPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
  return phone;
}

export function AdminCustomers() {
  const [customers, setCustomers] = useState<OrbiCustomer[]>([]);
  const [lastMissionByPhone, setLastMissionByPhone] = useState<Map<string, string>>(new Map());
  const [activeMissionsByPhone, setActiveMissionsByPhone] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unlocked = window.localStorage.getItem(ADMIN_SESSION_KEY) === "true";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(unlocked);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const load = () => {
      void getCustomers().then((list) => {
        setCustomers(list);
        setIsLoading(false);
      });
      // Rebuild phone → last mission map from localStorage history each refresh.
      const history = getMissionHistory();
      const lastMap = new Map<string, string>();
      for (const m of history) {
        const phone = (m.requester_phone ?? "").replace(/\D/g, "");
        if (phone && !lastMap.has(phone)) {
          lastMap.set(phone, m.service_type);
        }
      }
      setLastMissionByPhone(lastMap);

      // Build phone → active mission count from current active missions.
      const activeMap = new Map<string, number>();
      for (const m of getActiveMissions()) {
        if (isMissionClosed(m)) continue;
        const phone = (m.requester_phone ?? "").replace(/\D/g, "");
        if (phone) activeMap.set(phone, (activeMap.get(phone) ?? 0) + 1);
      }
      setActiveMissionsByPhone(activeMap);
    };
    load();
    return subscribeToCustomers(load);
  }, [isAdmin]);

  if (!isAdmin) return null;

  const registered = customers.filter((c) => c.isRegistered).length;
  const anonymous = customers.length - registered;
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalOrders = customers.reduce((sum, c) => sum + c.totalOrders, 0);

  return (
    <section className="mt-10 space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <UsersRound aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-black text-orbi-text">Clientes de Red Orbi</h2>
          <p className="text-xs text-orbi-muted">
            Identificados por número de WhatsApp — historial acumulado por dispositivo y misión
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Total clientes" value={String(customers.length)} />
        <MetricTile label="Pedidos totales" value={String(totalOrders)} />
        <MetricTile label="Gasto acumulado" value={`$${totalRevenue.toFixed(0)}`} />
        <MetricTile label="Con sesión guardada" value={String(registered + customers.filter((c) => !c.isRegistered && c.totalOrders > 1).length)} />
      </div>

      {isLoading ? (
        <p className="text-sm text-orbi-muted">Cargando clientes…</p>
      ) : customers.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-orbi-muted">
          Aún no hay clientes. Se crean automáticamente al enviar la primera misión.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-white/10">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <Th>WhatsApp</Th>
                <Th>Nombre</Th>
                <Th>Pedidos</Th>
                <Th>Misiones activas</Th>
                <Th>Gasto acumulado</Th>
                <Th>Última misión</Th>
                <Th>Fecha último pedido</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const normalizedPhone = c.phone.replace(/\D/g, "");
                const lastMission = lastMissionByPhone.get(normalizedPhone) ?? "—";
                return (
                  <tr key={c.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-orbi-cyan">
                      {displayPhone(c.phone)}
                    </td>
                    <td className="px-4 py-3 text-orbi-text">{c.name || "—"}</td>
                    <td className="px-4 py-3 text-center text-orbi-text">{c.totalOrders}</td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const count = activeMissionsByPhone.get(normalizedPhone) ?? 0;
                        return count > 0 ? (
                          <span className="rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-2 py-0.5 text-xs font-bold text-orbi-cyan">
                            {count}
                          </span>
                        ) : (
                          <span className="text-xs text-orbi-muted">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-orbi-text">${c.totalSpent.toFixed(0)}</td>
                    <td className="px-4 py-3 text-xs text-orbi-muted">{lastMission}</td>
                    <td className="px-4 py-3 text-xs text-orbi-muted">{formatDate(c.lastOrderAt)}</td>
                    <td className="px-4 py-3">
                      {c.isRegistered ? (
                        <span className="rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-2 py-0.5 text-[11px] font-bold text-orbi-cyan">
                          Registrado
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-orbi-muted">
                          Anónimo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">
      {children}
    </th>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-orbi-text">{value}</p>
    </div>
  );
}
