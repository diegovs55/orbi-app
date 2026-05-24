import { Network } from "lucide-react";
import { TrustPage } from "@/components/TrustPage";

export default function ConfianzaPage() {
  return (
    <TrustPage
      eyebrow="Red Orbi"
      title="Red segura y verificada"
      description="Orbi nace como una red local: cercana, práctica y construida para resolver con aliados confiables y seguimiento humano."
      icon={Network}
      sections={[
        {
          title: "Aliados locales",
          body: "Trabajamos con negocios de la zona para acercar productos, servicios y soluciones cotidianas con una experiencia más directa."
        },
        {
          title: "Revisión manual de negocios",
          body: "Los negocios afiliados se registran y revisan manualmente antes de mostrarse como parte de la red pública de Orbi."
        },
        {
          title: "Enfoque comunitario",
          body: "Red Orbi busca fortalecer la movilidad local, ayudar a comercios cercanos y resolver necesidades reales del día a día."
        },
        {
          title: "Protección y seguimiento",
          body: "Cada solicitud se coordina con datos mínimos, comunicación por WhatsApp y seguimiento suficiente para mantener claridad durante el proceso."
        }
      ]}
    />
  );
}
