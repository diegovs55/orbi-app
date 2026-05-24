import { PageShell } from "@/components/PageShell";
import { AdminOrders } from "@/components/AdminOrders";

export default function AdminPage() {
  return (
    <PageShell
      eyebrow="Panel Admin"
      title="Pedidos simulados y estados operativos."
      description="Una vista básica para validar cómo se vería el control de solicitudes antes de conectar base de datos."
    >
      <AdminOrders />
    </PageShell>
  );
}
