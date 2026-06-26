"use client";

import { useMemo, useState } from "react";

const states = ["Recibido", "En órbita", "En camino", "Entregado"] as const;

type OrderStatus = (typeof states)[number];

type Order = {
  id: string;
  customer: string;
  type: string;
  detail: string;
  zone: string;
  status: OrderStatus;
};

const statusStyles: Record<OrderStatus, string> = {
  Recibido: "border-white/10 bg-white/5 text-orbi-muted",
  "En órbita": "border-orbi-cyan/30 bg-orbi-cyan/10 text-orbi-cyan",
  "En camino": "border-orbi-blue/35 bg-orbi-blue/15 text-blue-100",
  Entregado: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
};

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);

  const counts = useMemo(() => {
    return states.map((state) => ({
      state,
      count: orders.filter((order) => order.status === state).length
    }));
  }, [orders]);

  function updateStatus(id: string, status: OrderStatus) {
    setOrders((currentOrders) =>
      currentOrders.map((order) => (order.id === id ? { ...order, status } : order))
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((item) => (
          <div
            key={item.state}
            className="rounded-md border border-white/10 bg-white/[0.04] p-4"
          >
            <p className="text-2xl font-black text-orbi-text">{item.count}</p>
            <p className="mt-1 text-xs font-semibold text-orbi-muted">{item.state}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-white/10 bg-orbi-panel/70 shadow-soft backdrop-blur">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-orbi-muted">
                <th className="px-4 py-4 font-bold">Pedido</th>
                <th className="px-4 py-4 font-bold">Cliente</th>
                <th className="px-4 py-4 font-bold">Tipo</th>
                <th className="px-4 py-4 font-bold">Detalle</th>
                <th className="px-4 py-4 font-bold">Zona</th>
                <th className="px-4 py-4 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-orbi-muted">
                  No hay pedidos registrados.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 last:border-b-0">
                  <td className="px-4 py-4 font-mono text-[10px] text-orbi-muted/60">Folio: #{order.id.slice(-8).toUpperCase()}</td>
                  <td className="px-4 py-4 text-orbi-text">{order.customer}</td>
                  <td className="px-4 py-4 text-orbi-muted">{order.type}</td>
                  <td className="px-4 py-4 text-orbi-muted">{order.detail}</td>
                  <td className="px-4 py-4 text-orbi-muted">{order.zone}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyles[order.status]}`}
                      >
                        {order.status}
                      </span>
                      <select
                        aria-label={`Actualizar estado de ${order.id}`}
                        className="rounded-md border border-white/10 bg-orbi-black px-2 py-2 text-xs text-orbi-text outline-none focus:border-orbi-cyan/60"
                        value={order.status}
                        onChange={(event) =>
                          updateStatus(order.id, event.target.value as OrderStatus)
                        }
                      >
                        {states.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
