import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { OrbitaClient } from "@/app/orbita/[missionId]/client";

// Required for output: "export". Returns a placeholder so the JS bundle is included;
// real missionIds are navigated client-side and never need a pre-generated HTML file.
export function generateStaticParams() {
  return [{ missionId: "__mobile__" }];
}

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
        <OrbitaClient missionId={missionId} />
      </Suspense>
    </PageShell>
  );
}
