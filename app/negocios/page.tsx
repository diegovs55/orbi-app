import { AffiliatedBusinesses } from "@/components/AffiliatedBusinesses";
import { PageShell } from "@/components/PageShell";

export default function NegociosPage() {
  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Categorías listas para validar demanda."
      description="Catálogo activo de negocios afiliados en vivo desde public.businesses."
    >
      <AffiliatedBusinesses />
    </PageShell>
  );
}
