import { AgentCards } from "@/components/AgentCards";
import { PageShell } from "@/components/PageShell";

export default function AgentePage() {
  return (
    <PageShell
      eyebrow="Portal Agente"
      title="Tu centro de órbita y misiones Orbi."
      description="Recibe, acepta y administra misiones en tiempo real desde la red local. Mantente en órbita y atiende solicitudes con confianza."
    >
      <AgentCards />
    </PageShell>
  );
}
