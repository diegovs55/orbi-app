import { RequestForm } from "@/components/RequestForm";
import { PageShell } from "@/components/PageShell";

export default function OrbitaPage() {
  return (
    <PageShell
      eyebrow="Ponerme en órbita"
      title="Solicita un traslado o movimiento local."
      description="Comparte origen, destino y referencia para que la red Orbi pueda coordinar la ruta."
    >
      <RequestForm mode="movilidad" />
    </PageShell>
  );
}
