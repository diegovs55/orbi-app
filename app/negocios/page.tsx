import { AffiliatedBusinesses } from "@/components/AffiliatedBusinesses";
import { PageShell } from "@/components/PageShell";

export default function NegociosPage() {
  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Categorías listas para validar demanda."
      description="Datos simulados para presentar una red local activa mientras se confirma el primer grupo de aliados."
    >
      <AffiliatedBusinesses />
    </PageShell>
  );
}
