"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AffiliatedBusinesses } from "@/components/AffiliatedBusinesses";
import { BusinessAccessPanel } from "@/components/BusinessAccessPanel";
import { BusinessCatalog } from "@/components/BusinessCatalog";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/lib/supabase";
import { getBusinessByAuthUserId } from "@/lib/businesses";
import {
  getBusinessSession,
  saveBusinessSession,
  clearBusinessSession,
} from "@/lib/businessSession";

export default function NegociosPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof getBusinessSession>>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void syncSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncSession() {
    // 1. Fast path: localStorage cache
    const cached = getBusinessSession();
    if (cached) {
      setSession(cached);
      setMounted(true);
      return;
    }
    // 2. Fallback: recover session from Supabase JWT (cross-device)
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      if (data.user.user_metadata?.must_change_password) {
        router.replace("/negocios/cambiar-contrasena");
        return;
      }
      const business = await getBusinessByAuthUserId(data.user.id);
      if (business) {
        const s = {
          id: business.id,
          name: business.name,
          email: business.email ?? data.user.email ?? "",
          supabaseBusinessId: business.id,
        };
        saveBusinessSession(s);
        setSession(s);
      }
    }
    setMounted(true);
  }

  function handleLogout() {
    clearBusinessSession();
    void supabase.auth.signOut();
    setSession(null);
  }

  if (!mounted) {
    return <div className="min-h-screen bg-orbi-black" />;
  }

  if (session) {
    return (
      <PageShell
        eyebrow="Panel de negocio"
        title="Tu negocio en Orbi."
        description="Administra tus productos y mantén tu catálogo actualizado."
      >
        <BusinessCatalog onLogout={handleLogout} />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Categorías listas para validar demanda."
      description="Catálogo activo de negocios afiliados en vivo desde public.businesses."
    >
      <BusinessAccessPanel onLogin={() => void syncSession()} />
      <AffiliatedBusinesses />
    </PageShell>
  );
}
