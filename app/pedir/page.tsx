import { PageShell } from "@/components/PageShell";
import { ServiceRequestFlow } from "@/components/ServiceRequestFlow";

export default async function PedirPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const { productId } = await searchParams;
  return (
    <PageShell
      eyebrow="Pedir algo"
      title="¿Qué necesitas hoy?"
      description=""
    >
      <ServiceRequestFlow productId={productId} />
    </PageShell>
  );
}
