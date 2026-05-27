import { PageShell } from "@/components/PageShell";
import { AdminAccessGate } from "@/components/AdminAccessGate";
import { AdminControlPanel } from "@/components/AdminControlPanel";
import { AdminCatalog } from "@/components/AdminCatalog";
import { AdminAgents } from "@/components/AdminAgents";

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Centro operativo de Red Orbi."
      description="Control de misiones, agentes, pagos, negocios y señales de crecimiento de la red local."
    >
      <AdminAccessGate>
        <AdminControlPanel />
        <AdminCatalog />
        <AdminAgents />
      </AdminAccessGate>
    </PageShell>
  );
}
