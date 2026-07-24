import { AgentAccessPanel } from "@/components/AgentAccessPanel";
import { AgentCards } from "@/components/AgentCards";
import { PageShell } from "@/components/PageShell";

export default function AgentesPage() {
  return (
    <PageShell
      eyebrow="Agentes Orbi"
      title="Red de apoyo local visible y confiable."
      description="Las personas reales detrás de cada pedido."
    >
      <AgentAccessPanel />
      <AgentCards />
    </PageShell>
  );
}
