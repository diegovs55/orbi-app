import { PackagePlus } from "lucide-react";
import Image from "next/image";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { ActiveMissionsWidget } from "@/components/ActiveMissionsWidget";

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
          <div className="mb-7 flex h-36 w-36 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-orbi-black/40 shadow-glow sm:h-44 sm:w-44">
            <Image
              src="/orbi-logo.png"
              alt="Orbi"
              width={176}
              height={176}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
            Red Orbi
          </p>
          <h1 className="text-5xl font-black leading-none tracking-normal text-orbi-text sm:text-7xl">
            Lo que necesitas, en órbita.
          </h1>
          <p className="mt-5 text-lg font-semibold text-orbi-cyan sm:text-xl">
            Conectamos · Movemos · Entregamos
          </p>
          <p className="mt-5 max-w-xl text-base leading-7 text-orbi-muted sm:text-lg">
            Solo dime qué necesitas. Red Orbi coordina la ruta local para mover personas,
            productos o pendientes con claridad y seguimiento.
          </p>
        </div>

        <div className="relative mt-10 max-w-sm">
          <OrbiButton href="/pedir" icon={PackagePlus} className="w-full text-base">
            Pedir algo
          </OrbiButton>
        </div>

        <ActiveMissionsWidget />

        <div className="mt-6 flex max-w-2xl flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-orbi-muted">
          {["Traslados", "Entregas", "Compras", "Mandados", "Trámites"].map((item, index) => (
            <span key={item} className="inline-flex items-center gap-3">
              <span>{item}</span>
              {index < 4 ? <span className="text-orbi-cyan/60">·</span> : null}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
