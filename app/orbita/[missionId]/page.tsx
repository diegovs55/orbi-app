import { Suspense } from "react";
import { MissionOrbitTracker } from "@/components/MissionOrbitTracker";
import { PageShell } from "@/components/PageShell";

interface Props {
  params: Promise<{ missionId: string }>;
}

export default async function OrbitaMissionPage({ params }: Props) {
  const { missionId } = await params;

  return (
    <PageShell
      eyebrow="Seguimiento Orbi"
      title="Misión en órbita"
      description="Sigue en tiempo real el avance de tu entrega, traslado o mandado."
    >
      <Suspense>
        <MissionOrbitTracker initialMissionId={missionId} />
      </Suspense>
    </PageShell>
  );
}
