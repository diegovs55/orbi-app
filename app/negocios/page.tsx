"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { SupportCard } from "@/components/SupportCard";
import { BusinessAccessPanel } from "@/components/BusinessAccessPanel";
import { BusinessCatalog } from "@/components/BusinessCatalog";
import { PageShell } from "@/components/PageShell";
import { supabaseBusiness as supabase } from "@/lib/supabase-business-client";
import { getBusinessByAuthUserId } from "@/lib/businesses";
import { PushSetup } from "@/components/PushSetup";
import { apiUrl } from "@/lib/api-url";
import {
  getBusinessSession,
  saveBusinessSession,
  clearBusinessSession,
} from "@/lib/businessSession";

// AffiliatedBusinesses usa react-leaflet que requiere window — carga solo en cliente.
const AffiliatedBusinesses = dynamic(
  () => import("@/components/AffiliatedBusinesses").then((m) => m.AffiliatedBusinesses),
  { ssr: false },
);

export default function NegociosPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof getBusinessSession>>(null);
  const [mounted, setMounted] = useState(false);
  const openBusinessRequest = useRef<(() => void) | null>(null);

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
      if (business && business.status === "activo") {
        const s = {
          id: business.id,
          name: business.name,
          email: business.email ?? data.user.email ?? "",
          supabaseBusinessId: business.id,
        };
        saveBusinessSession(s);
        setSession(s);
      } else if (business && business.status !== "activo") {
        await supabase.auth.signOut();
      }
    }
    setMounted(true);
  }

  async function handleLogout() {
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token ?? null;
    const deviceId = localStorage.getItem("orbi_installation_id");
    if (jwt && deviceId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch(apiUrl("/api/push/unregister"), {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: deviceId }),
          signal: controller.signal,
        });
      } catch { /* best-effort */ } finally { clearTimeout(timeout); }
    }
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
        <PushSetup getAccessToken={async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        }} />
        <BusinessCatalog onLogout={handleLogout} />
        <div className="mt-6">
          <SupportCard />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Los negocios que confían en Orbi."
      description=""
    >
      <div className="flex flex-col gap-8">
        <AffiliatedBusinesses onOpenRequest={() => openBusinessRequest.current?.()} />
        <BusinessAccessPanel
          onLogin={() => void syncSession()}
          registerOpen={(fn) => { openBusinessRequest.current = fn; }}
        />
      </div>
    </PageShell>
  );
}
