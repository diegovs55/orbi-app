import { PageShell } from "@/components/PageShell";
import { ServiceRequestFlow } from "@/components/ServiceRequestFlow";

export default function PedirPage() {
  return (
    <PageShell
      eyebrow="Pedir algo"
      title="¿Qué necesitas hoy?"
      description="Define la necesidad, completa la ficha operativa y elige un agente disponible para resolverla."
    >
      <ServiceRequestFlow />
    </PageShell>
  );
}
