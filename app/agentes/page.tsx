import { AgentAccessPanel } from "@/components/AgentAccessPanel";
import { AgentCards } from "@/components/AgentCards";
import { NearbyOrbitsWrapper } from "@/components/NearbyOrbitsWrapper";
import { PageShell } from "@/components/PageShell";

export default function AgentesPage() {
  return (
    <PageShell
      eyebrow="Agentes Orbi"
      title="Red de apoyo local visible y confiable."
      description="Personas reales detrás de cada pedido."
    >
      <div className="flex flex-col gap-8">
        <NearbyOrbitsWrapper />
        <AgentAccessPanel />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
            Agentes de Órbita
          </p>
          <p className="mt-1 text-sm text-orbi-muted">
            Personas verificadas que forman parte de ORBI y que están cerca de ti.
          </p>
        </div>
        <AgentCards hideCards />
      </div>
    </PageShell>
  );
}
