import { ShieldCheck } from "lucide-react";
import { TrustPage } from "@/components/TrustPage";

export default function PrivacidadPage() {
  return (
    <TrustPage
      eyebrow="Confianza Orbi"
      title="Aviso de privacidad"
      description="En ORBI recopilamos únicamente la información necesaria para operar la red logística, coordinar solicitudes y misiones, brindar seguimiento y mantener una experiencia segura y funcional."
      icon={ShieldCheck}
      sections={[
        {
          title: "Datos de cuenta y contacto",
          body: "Podemos recopilar nombre, correo electrónico y número de teléfono para identificar tu cuenta, facilitar el acceso a ORBI, comunicarnos contigo cuando sea necesario para prestar el servicio y mantener vinculadas tus solicitudes y misiones."
        },
        {
          title: "Direcciones, ubicación y misiones",
          body: "Podemos recopilar direcciones, referencias y ubicación precisa cuando son necesarias para establecer origen y destino, calcular rutas y distancias, determinar cobertura, coordinar entregas, traslados, recolecciones o mandados y mostrar el seguimiento de una misión."
        },
        {
          title: "Información que proporcionas",
          body: "Podemos almacenar descripciones, instrucciones, referencias u otros datos que escribas al solicitar un servicio, únicamente para comprender, coordinar y ejecutar correctamente la misión solicitada."
        },
        {
          title: "Identificadores y funcionamiento de la app",
          body: "ORBI utiliza identificadores de usuario y de dispositivo para mantener sesiones, relacionar cuentas con sus misiones, habilitar funciones de la app, gestionar dispositivos autorizados y operar servicios técnicos como las notificaciones."
        },
        {
          title: "Historial de pedidos y compras",
          body: "ORBI puede conservar el historial de pedidos, compras locales y misiones vinculadas a tu cuenta para mostrar su estado, dar seguimiento al servicio, mantener un registro operativo y permitirte consultar tu actividad dentro de la plataforma."
        },
        {
          title: "Protección y uso de la información",
          body: "La información recopilada se utiliza para la funcionalidad de ORBI y para prestar el servicio solicitado. No vendemos datos personales, no los utilizamos para publicidad dirigida y no realizamos seguimiento de usuarios entre aplicaciones o sitios web de terceros."
        },
        {
          title: "Pagos",
          body: "ORBI actualmente no recopila datos de tarjetas bancarias ni procesa pagos con tarjeta dentro de la app. Cuando una misión contempla un pago, la aplicación puede mostrar el método y estado correspondiente como parte de la operación del servicio."
        },
        {
          title: "Contacto y derechos",
          body: "Si tienes dudas sobre el uso de tu información o deseas solicitar su corrección o eliminación, puedes contactar a ORBI en orbimx@icloud.com o al +52 220 644 1442."
        }
      ]}
    />
  );
}
