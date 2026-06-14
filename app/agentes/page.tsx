import { AgentCards } from "@/components/AgentCards";
import { AgentAccessPanel } from "@/components/AgentAccessPanel";
import { PageShell } from "@/components/PageShell";

export default function AgentesPage() {
  return (
    <PageShell
      eyebrow="Agentes Orbi"
      title="Red de apoyo local visible y confiable."
      description="Consulta agentes, repartidores y prestadores registrados para coordinar mandados, entregas, traslados y recolecciones."
    >
      <AgentAccessPanel />
      <AgentCards />
    </PageShell>
  );
}
