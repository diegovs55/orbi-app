import { PageShell } from "@/components/PageShell";
import { AdminBusinesses } from "@/components/AdminBusinesses";
import { AdminAgents } from "@/components/AdminAgents";

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Administra la red local de negocios."
      description="Acceso privado básico para dar de alta aliados y validar operación antes de conectar Supabase."
    >
      <div className="space-y-8">
        <AdminBusinesses />
        <AdminAgents />
      </div>
    </PageShell>
  );
}
