import { PageShell } from "@/components/PageShell";
import { ServiceRequestFlow } from "@/components/ServiceRequestFlow";

export default function PedirPage() {
  return (
    <PageShell
      eyebrow="Pedir algo"
      title="¿Qué necesitas hoy?"
      description=""
    >
      <ServiceRequestFlow />
    </PageShell>
  );
}
