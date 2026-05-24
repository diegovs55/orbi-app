import { ShieldCheck } from "lucide-react";
import { TrustPage } from "@/components/TrustPage";

export default function PrivacidadPage() {
  return (
    <TrustPage
      eyebrow="Confianza Orbi"
      title="Aviso de privacidad"
      description="En Orbi cuidamos la información necesaria para coordinar solicitudes locales de forma clara, limitada y responsable."
      icon={ShieldCheck}
      sections={[
        {
          title: "Recopilación básica de datos",
          body: "Podemos solicitar nombre, teléfono, descripción del pedido, origen, destino o referencias para entender tu solicitud y coordinar la atención."
        },
        {
          title: "WhatsApp y ubicación",
          body: "Las solicitudes se envían por WhatsApp con el mensaje prellenado. Las direcciones o referencias se usan únicamente para orientar la entrega, traslado o mandado solicitado."
        },
        {
          title: "Protección de información",
          body: "La información se usa solo para operar Red Orbi, dar seguimiento y mejorar la experiencia. No vendemos datos personales ni los usamos para fines ajenos al servicio."
        },
        {
          title: "Contacto Orbi",
          body: "Para dudas, correcciones o eliminación de información, puedes contactar a Orbi por el mismo canal de WhatsApp usado para levantar solicitudes."
        }
      ]}
    />
  );
}
