import { FileText } from "lucide-react";
import { TrustPage } from "@/components/TrustPage";

export default function TerminosPage() {
  return (
    <TrustPage
      eyebrow="Operación Orbi"
      title="Términos y condiciones"
      description="Estos términos explican cómo funciona Orbi como red local de conexión, movilidad y coordinación de necesidades."
      icon={FileText}
      sections={[
        {
          title: "Disponibilidad variable",
          body: "La disponibilidad de aliados, rutas y atención puede cambiar según horario, zona, demanda, clima u otras condiciones operativas."
        },
        {
          title: "Tiempos estimados",
          body: "Los tiempos mostrados son aproximados y no constituyen una garantía. Orbi procura coordinar cada solicitud con rapidez y comunicación clara."
        },
        {
          title: "Negocios afiliados",
          body: "Cada negocio afiliado es responsable de sus productos, precios, calidad, inventario y condiciones comerciales. Orbi facilita la conexión y coordinación."
        },
        {
          title: "Uso correcto de la plataforma",
          body: "Las solicitudes deben ser legales, claras y respetuosas. Orbi puede rechazar pedidos que pongan en riesgo a personas, aliados o la operación de la red."
        }
      ]}
    />
  );
}
