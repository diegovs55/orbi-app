import { RequestForm } from "@/components/RequestForm";
import { PageShell } from "@/components/PageShell";

export default function PedirPage() {
  return (
    <PageShell
      eyebrow="Pedir algo"
      title="Cuéntanos qué necesitas mover o conseguir."
      description="Orbi arma el pedido y lo envía por WhatsApp para coordinar la atención local."
    >
      <RequestForm mode="pedido" />
    </PageShell>
  );
}
