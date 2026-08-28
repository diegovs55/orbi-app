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
      <div className="flex flex-col gap-10">
        <NearbyOrbitsWrapper />
        <div className="border-t border-white/[0.05] pt-8">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.20em] text-orbi-cyan/70">
              Agentes de Órbita
            </p>
            <p className="mt-1.5 text-sm leading-6 text-orbi-muted/80">
              Personas verificadas que forman parte de ORBI y que están cerca de ti.
            </p>
          </div>
          <AgentCards hideCards />
        </div>
        <div className="border-t border-white/[0.05] pt-6">
          <AgentAccessPanel />
        </div>
      </div>
    </PageShell>
  );
}
