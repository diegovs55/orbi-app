import Link from "next/link";
import { Radar } from "lucide-react";
import { PageShell } from "@/components/PageShell";

export default function OrbitaPage() {
  return (
    <PageShell
      eyebrow="Seguimiento Orbi"
      title="Misión en órbita"
      description="Sigue en tiempo real el avance de tu entrega, traslado o mandado."
    >
      <section className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-6 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
          <Radar aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-black text-orbi-text">No tienes pedidos activos</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-orbi-muted">
          Cuando hagas un pedido, podrás ver aquí su avance en tiempo real.
        </p>
        <Link
          href="/pedir"
          className="mt-6 inline-flex min-h-12 items-center justify-center rounded-md bg-orbi-blue px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
        >
          Hacer un pedido
        </Link>
      </section>
    </PageShell>
  );
}
