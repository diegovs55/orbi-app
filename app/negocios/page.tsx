"use client";

import { useState } from "react";
import { AffiliatedBusinesses } from "@/components/AffiliatedBusinesses";
import { BusinessAccessPanel } from "@/components/BusinessAccessPanel";
import { BusinessCatalog } from "@/components/BusinessCatalog";
import { PageShell } from "@/components/PageShell";
import { getBusinessSession } from "@/lib/businessSession";

export default function NegociosPage() {
  const [hasSession, setHasSession] = useState<boolean>(
    () => typeof window !== "undefined" && getBusinessSession() !== null
  );


  if (hasSession) {
    return (
      <PageShell
        eyebrow="Panel de negocio"
        title="Tu negocio en Orbi."
        description="Administra tus productos y mantén tu catálogo actualizado."
      >
        <BusinessCatalog onLogout={() => setHasSession(false)} />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Categorías listas para validar demanda."
      description="Catálogo activo de negocios afiliados en vivo desde public.businesses."
    >
      <BusinessAccessPanel onLogin={() => setHasSession(true)} />
      <AffiliatedBusinesses />
    </PageShell>
  );
}
