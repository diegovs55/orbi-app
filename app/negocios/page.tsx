import { Coffee, Gift, Pill, Printer, ShoppingBag } from "lucide-react";
import { PageShell } from "@/components/PageShell";

const categories = [
  {
    name: "Café y comida",
    description: "Pide desayuno, café o snacks sin salir de casa.",
    icon: Coffee,
    rating: "4.8",
    partners: ["Regina Café", "Panadería Lupita", "Taquería Central"]
  },
  {
    name: "Farmacia",
    description: "Medicamentos y artículos urgentes entregados rápido.",
    icon: Pill,
    rating: "4.9",
    partners: ["Farmacia San Antonio", "Botiquín Express", "Salud 24h"]
  },
  {
    name: "Papelería",
    description: "Copias, impresiones y útiles cuando los necesitas.",
    icon: Printer,
    rating: "4.7",
    partners: ["Papelería Centro", "Copias Express", "Útiles Lupita"]
  },
  {
    name: "Regalos",
    description: "Flores, detalles y sorpresas en ruta.",
    icon: Gift,
    rating: "4.8",
    partners: ["Florería D’Luz", "Sorpresas Regina", "Detalles Ana"]
  },
  {
    name: "Mandados",
    description: "Compras, pagos y vueltas coordinadas por Orbi.",
    icon: ShoppingBag,
    rating: "4.9",
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
              className="group rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-orbi-cyan/35 hover:shadow-[0_24px_70px_rgba(0,0,0,0.34),0_0_38px_rgba(31,139,255,0.16)]"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                    Disponible
                  </span>
                  <h2 className="text-xl font-black tracking-normal text-orbi-text">
                    {category.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-orbi-muted">{category.description}</p>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_22px_rgba(31,139,255,0.12)] transition group-hover:bg-orbi-blue/22">
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orbi-muted">
                    Tiempo estimado
                  </p>
                  <p className="mt-1 text-sm font-black text-orbi-text">15–25 min</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orbi-muted">
                    Rating
                  </p>
                  <p className="mt-1 text-sm font-black text-orbi-text">⭐ {category.rating}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {category.partners.map((partner) => (
                  <span
                    key={partner}
                    className="rounded-full border border-orbi-cyan/15 bg-orbi-blue/[0.08] px-3 py-1.5 text-xs font-semibold text-orbi-text"
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
