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

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Centro operativo de Red Orbi."
      description="Control de misiones, agentes, pagos, negocios y señales de crecimiento de la red local."
    >
      <AdminAccessGate>
        <AdminLiveOperations />
        <AdminNetworkEconomy />
        <AdminDistribution />
        <AdminConversion />
        <AdminLeaders />
        <AdminHistory />

        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              G — Administración
            </p>
            <h2 className="mt-1 text-xl font-black text-orbi-text">
              Solicitudes, agentes y negocios
            </h2>
          </div>
        </div>

        <AdminPendingRequests />
        <AdminAgentsPanel />
        <AdminBusinessesPanel />
        <AdminCustomers />
        <AdminMotorParams />
      </AdminAccessGate>
    </PageShell>
  );
}
