import { ArrowRight, Building2, PackagePlus, Route } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between">
        <BrandMark />
        <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
          MVP
        </span>
      </header>

      <section className="relative flex flex-1 flex-col justify-center py-12 sm:py-16">
        <div className="pointer-events-none absolute right-[-18%] top-24 hidden h-[32rem] w-[32rem] rounded-full border border-orbi-cyan/15 sm:block">
          <span className="orbit-ring" />
        </div>

        <div className="relative max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
            Red Orbi
          </p>
          <h1 className="text-5xl font-black leading-none tracking-normal text-orbi-text sm:text-7xl">
            Lo que necesitas, en órbita.
          </h1>
          <p className="mt-5 text-lg font-semibold text-orbi-cyan sm:text-xl">
            Conectamos • Movemos • Llegamos
          </p>
          <p className="mt-5 max-w-xl text-base leading-7 text-orbi-muted sm:text-lg">
            Una red logística y de movilidad local para pedir productos, resolver mandados
            y coordinar traslados sin instalar una app nativa.
          </p>
        </div>

        <div className="relative mt-10 grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <OrbiButton href="/pedir" icon={PackagePlus} className="w-full">
            Pedir algo
          </OrbiButton>
          <OrbiButton href="/orbita" icon={Route} variant="secondary" className="w-full">
            Ponerme en órbita
          </OrbiButton>
          <OrbiButton href="/negocios" icon={Building2} variant="secondary" className="w-full sm:col-span-2">
            Negocios afiliados
          </OrbiButton>
        </div>

        <div className="mt-10 grid gap-3 text-sm text-orbi-muted sm:max-w-2xl sm:grid-cols-3">
          {["Necesidades locales", "Movilidad cercana", "Entrega coordinada"].map((item) => (
            <div key={item} className="flex items-center gap-2 border-l border-orbi-cyan/35 pl-3">
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-orbi-cyan" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
