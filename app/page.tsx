import { ClipboardList, CreditCard, Navigation, Package, PackagePlus, ShoppingBag } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";

const SERVICES = [
  { label: "Traslados", icon: Navigation },
  { label: "Entregas", icon: Package },
  { label: "Compras", icon: ShoppingBag },
  { label: "Mandados", icon: ClipboardList },
  { label: "Trámites", icon: CreditCard },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between">
        {/* BrandMark oficial — escala visual +12%, ligeramente más abajo */}
        <div className="mt-1.5" style={{ transform: "scale(1.12)", transformOrigin: "top left" }}>
          <BrandMark />
        </div>
        <span className="rounded-full border border-orbi-cyan/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.15em] text-orbi-cyan/35">
          MVP
        </span>
      </header>

      <section className="relative flex flex-1 flex-col justify-center py-14 sm:py-20">
        <div className="pointer-events-none absolute right-[-18%] top-24 hidden h-[32rem] w-[32rem] rounded-full border border-orbi-cyan/15 sm:block">
          <span className="orbit-ring" />
        </div>

        <div className="relative max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-orbi-cyan">
            Red Orbi
          </p>

          <h1 className="text-5xl font-black leading-[1.05] tracking-tight text-orbi-text [text-wrap:balance] sm:text-[5.5rem]">
            Lo que necesitas, en órbita.
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-orbi-muted/80">
            Estamos aquí. Solo cuéntanos qué necesitas.
          </p>
        </div>

        <div className="relative mt-10 max-w-xs sm:max-w-sm">
          <OrbiButton href="/pedir" icon={PackagePlus} className="w-full text-base">
            Pedir algo
          </OrbiButton>
        </div>

        {/* Tagline muy terciario */}
        <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-orbi-muted/35">
          Conectamos · Movemos · Entregamos
        </p>

        {/* Categorías — chips premium con íconos existentes de lucide-react */}
        <div className="mt-4 flex flex-wrap gap-x-2 gap-y-2">
          {SERVICES.map(({ label, icon: Icon }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-orbi-muted/55"
            >
              <Icon className="h-3 w-3 text-orbi-cyan/45" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
