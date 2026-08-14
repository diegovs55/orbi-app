import dynamic from "next/dynamic";
import { AgentAccessPanel } from "@/components/AgentAccessPanel";
import { AgentCards } from "@/components/AgentCards";
import { PageShell } from "@/components/PageShell";

// react-leaflet requires browser globals — SSR must be disabled
const NearbyOrbitsPreview = dynamic(
  () => import("@/components/NearbyOrbitsPreview").then((m) => m.NearbyOrbitsPreview),
  { ssr: false },
);

export default function AgentesPage() {
  return (
    <PageShell
      eyebrow="Agentes Orbi"
      title="Red de apoyo local visible y confiable."
      description="Las personas reales detrás de cada pedido."
    >
      <NearbyOrbitsPreview />
      <AgentAccessPanel />
      <AgentCards />
    </PageShell>
  );
}
