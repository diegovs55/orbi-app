import { MissionOrbitTracker } from "@/components/MissionOrbitTracker";
import { PageShell } from "@/components/PageShell";

export default function OrbitaPage() {
  return (
    <PageShell
      eyebrow="Seguimiento Orbi"
      title="Misión en órbita"
      description="Sigue en tiempo real el avance de tu entrega, traslado o mandado."
    >
      <MissionOrbitTracker />
    </PageShell>
  );
}
