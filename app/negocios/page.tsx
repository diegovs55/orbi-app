import { Coffee, Gift, Pill, Printer, ShoppingBag } from "lucide-react";
import { PageShell } from "@/components/PageShell";

const categories = [
  {
    name: "Café y comida",
    description: "Bebidas, desayunos, snacks y pedidos rápidos.",
    icon: Coffee,
    partners: ["Café Nodo", "Mesa Local", "Pan de Ruta"]
  },
  {
    name: "Farmacia",
    description: "Medicamentos, cuidado personal y artículos urgentes.",
    icon: Pill,
    partners: ["Farmacia Central", "Salud Express", "Botiquín 24"]
  },
  {
    name: "Papelería",
    description: "Impresiones, copias, útiles, sobres y trámites.",
    icon: Printer,
    partners: ["Print Hub", "Papel Punto", "OfiRed"]
  },
  {
    name: "Regalos",
    description: "Detalles, flores, envolturas y compras especiales.",
    icon: Gift,
    partners: ["Detalle Azul", "Flor y Forma", "Sorpresa Local"]
  },
  {
    name: "Mandados",
    description: "Compras, pagos, recolecciones y entregas cercanas.",
    icon: ShoppingBag,
    partners: ["Orbi Express", "Ruta Corta", "Recados Pro"]
  }
];

export default function NegociosPage() {
  return (
    <PageShell
      eyebrow="Negocios afiliados"
      title="Categorías listas para validar demanda."
      description="Datos simulados para presentar una red local activa mientras se confirma el primer grupo de aliados."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <article
              key={category.name}
              className="rounded-md border border-white/10 bg-orbi-panel/70 p-5 shadow-soft backdrop-blur"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black tracking-normal text-orbi-text">
                    {category.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-orbi-muted">{category.description}</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-orbi-blue/15 text-orbi-cyan">
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {category.partners.map((partner) => (
                  <span
                    key={partner}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-orbi-muted"
                  >
                    {partner}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </PageShell>
  );
}
