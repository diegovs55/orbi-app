"use client";

import { Send } from "lucide-react";
import { FormEvent } from "react";
import { FormField } from "@/components/FormField";
import { OrbiButton } from "@/components/OrbiButton";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type RequestFormProps = {
  mode: "pedido" | "movilidad";
};

export function RequestForm({ mode }: RequestFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const message =
      mode === "pedido"
        ? [
            "Nuevo pedido Orbi",
            `Nombre: ${data.get("name")}`,
            `Telefono: ${data.get("phone")}`,
            `Necesito: ${data.get("need")}`,
            `Direccion o referencia: ${data.get("address")}`
          ].join("\n")
        : [
            "Nueva solicitud para ponerme en orbita",
            `Nombre: ${data.get("name")}`,
            `Telefono: ${data.get("phone")}`,
            `Punto de origen: ${data.get("origin")}`,
            `Destino: ${data.get("destination")}`,
            `Referencia: ${data.get("reference")}`
          ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-md border border-white/10 bg-orbi-panel/70 p-4 shadow-soft backdrop-blur sm:p-6"
    >
      <FormField label="Nombre" name="name" placeholder="Tu nombre" />
      <FormField label="Teléfono" name="phone" type="tel" placeholder="55 0000 0000" />
      {mode === "pedido" ? (
        <>
          <FormField
            label="¿Qué necesitas?"
            name="need"
            placeholder="Describe el producto, mandado o apoyo"
            textarea
          />
          <FormField
            label="Dirección o referencia"
            name="address"
            placeholder="Calle, colonia, punto de entrega o referencia"
            textarea
          />
        </>
      ) : (
        <>
          <FormField label="Punto de origen" name="origin" placeholder="¿Dónde iniciamos?" />
          <FormField label="Destino" name="destination" placeholder="¿A dónde vamos?" />
          <FormField
            label="Referencia"
            name="reference"
            placeholder="Detalles, horario, contacto o instrucciones"
            textarea
          />
        </>
      )}
      <OrbiButton type="submit" icon={Send} className="mt-2 w-full">
        {mode === "pedido" ? "Enviar por WhatsApp" : "Solicitar por WhatsApp"}
      </OrbiButton>
    </form>
  );
}
