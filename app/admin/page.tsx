import { PageShell } from "@/components/PageShell";
import { AdminControlPanel } from "@/components/AdminControlPanel";
import { AdminBusinesses } from "@/components/AdminBusinesses";
import { AdminCatalog } from "@/components/AdminCatalog";
import { AdminAgents } from "@/components/AdminAgents";

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Centro operativo de Red Orbi."
      description="Control de misiones, agentes, pagos, negocios y señales de crecimiento de la red local."
    >
      <div className="space-y-8">
        <AdminControlPanel />
        <AdminBusinesses />
        <AdminCatalog />
        <AdminAgents />
      </div>
    </PageShell>
  );
}
