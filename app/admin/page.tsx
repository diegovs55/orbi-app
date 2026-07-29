import { PageShell } from "@/components/PageShell";
import { AdminAccessGate } from "@/components/AdminAccessGate";
import { AdminLiveOperations } from "@/components/AdminLiveOperations";
import { AdminNetworkEconomy } from "@/components/AdminNetworkEconomy";
import { AdminDistribution } from "@/components/AdminDistribution";
import { AdminConversion } from "@/components/AdminConversion";
import { AdminLeaders } from "@/components/AdminLeaders";
import { AdminHistory } from "@/components/AdminHistory";
import { AdminAgentsPanel } from "@/components/AdminAgentsPanel";
import { AdminBusinessesPanel } from "@/components/AdminBusinessesPanel";
import { AdminCustomers } from "@/components/AdminCustomers";
import { AdminPendingRequests } from "@/components/AdminPendingRequests";
import { AdminMotorParams } from "@/components/AdminMotorParams";
import { AdminIntelligence } from "@/components/AdminIntelligence";

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Centro operativo de Red Orbi."
      description=""
    >
      <AdminAccessGate>

        {/* ── SECCIÓN 1 — ¿Qué está pasando ahora? ─────────────────────── */}
        <AdminLiveOperations />

        {/* ── SECCIÓN 2 — ¿Cómo va el negocio? ────────────────────────── */}
        <AdminNetworkEconomy />
        <AdminDistribution />
        <AdminConversion />

        {/* ── SECCIÓN 4 — ¿Quién mueve la red? ────────────────────────── */}
        <AdminLeaders />

        {/* ── SECCIÓN 5 — ¿Quiénes son los actores? ───────────────────── */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Administración
            </p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">
              Solicitudes, agentes, negocios y clientes
            </h2>
          </div>
        </div>
        <AdminPendingRequests />
        <AdminAgentsPanel />
        <AdminBusinessesPanel />
        <AdminCustomers />

        {/* ── SECCIÓN 6 — ¿Qué pasó antes? ────────────────────────────── */}
        <AdminHistory />

        {/* ── SECCIÓN 7 — ¿Cómo está el motor? ────────────────────────── */}
        <AdminMotorParams />

        {/* ── SECCIÓN 8 — Inteligencia de la red ───────────────────────── */}
        <AdminIntelligence />

      </AdminAccessGate>
    </PageShell>
  );
}
