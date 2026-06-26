"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getCustomers, OrbiCustomer } from "@/lib/customers";
import { subscribeToCustomers } from "@/lib/supabase";

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

export function AdminConversion() {
  const isUnlocked = useSyncExternalStore(
    subscribeToAdminSession,
    readAdminSession,
    () => false
  );
  const [customers, setCustomers] = useState<OrbiCustomer[]>([]);

  useEffect(() => {
    if (!isUnlocked) return;
    const refresh = async () => setCustomers(await getCustomers());
    void refresh();
    return subscribeToCustomers(() => void refresh());
  }, [isUnlocked]);

  const stats = useMemo(() => {
    const total = customers.length;
    const registered = customers.filter((c) => c.isRegistered).length;
    const anonymous = total - registered;
    const conversion =
      total > 0 ? Number(((registered / total) * 100).toFixed(1)) : 0;
    return { total, registered, anonymous, conversion };
  }, [customers]);

  if (!isUnlocked) return null;

  const bars = [
    {
      label: "Registrados",
      count: stats.registered,
      pct:
        stats.total > 0
          ? Math.round((stats.registered / stats.total) * 100)
          : 0,
    },
    {
      label: "Anónimos",
      count: stats.anonymous,
      pct:
        stats.total > 0
          ? Math.round((stats.anonymous / stats.total) * 100)
          : 0,
    },
  ];
  const max = Math.max(stats.registered, stats.anonymous, 1);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
          Conversión
        </p>
        <h2 className="mt-1 text-xl font-black text-orbi-text">
          Clientes y registro
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ConvCard label="Total clientes" value={String(stats.total)} />
        <ConvCard
          label="Registrados"
          value={String(stats.registered)}
          accent="cyan"
        />
        <ConvCard label="Anónimos" value={String(stats.anonymous)} />
        <ConvCard
          label="Tasa conversión"
          value={`${stats.conversion}%`}
          accent={stats.conversion >= 30 ? "emerald" : undefined}
        />
      </div>

      <div className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
          Distribución de clientes
        </p>
        {stats.total === 0 ? (
          <p className="py-4 text-center text-xs text-orbi-muted">
            Sin datos todavía.
          </p>
        ) : (
          <div className="space-y-3">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-1.5 flex justify-between gap-3 text-xs">
                  <span className="font-semibold text-orbi-muted">
                    {bar.label}
                  </span>
                  <span className="font-black text-orbi-text">
                    {bar.count} ({bar.pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-orbi-blue shadow-glow transition-all duration-500"
                    style={{
                      width: `${bar.count > 0 ? Math.max(4, Math.round((bar.count / max) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-orbi-muted/60">
        Fuente:{" "}
        <code className="font-mono">public.customers</code> · conversión =
        clientes con cuenta / total únicos.
      </p>
    </section>
  );
}

function ConvCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "cyan" | "emerald";
}) {
  const border =
    accent === "emerald"
      ? "border-emerald-400/25 bg-emerald-400/[0.06]"
      : accent === "cyan"
      ? "border-orbi-cyan/25 bg-orbi-blue/10"
      : "border-white/10 bg-white/[0.04]";
  const text =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "cyan"
      ? "text-orbi-cyan"
      : "text-orbi-text";

  return (
    <article className={`rounded-md border p-4 ${border}`}>
      <p className={`text-2xl font-black ${text}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-orbi-muted">{label}</p>
    </article>
  );
}
