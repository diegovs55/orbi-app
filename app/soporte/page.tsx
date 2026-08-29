import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { SupportCard } from "@/components/SupportCard";

export const metadata = {
  title: "Atención ORBI",
  description: "¿Tienes alguna duda o necesitas ayuda? Contáctanos.",
};

export default function SoportePage() {
  return (
    <PageShell
      eyebrow="Soporte"
      title="Atención ORBI"
      description="¿Tienes alguna duda o necesitas ayuda?"
    >
      <div className="flex max-w-sm flex-col gap-8">
        <SupportCard />
        <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-[rgba(8,20,36,0.55)] to-[rgba(5,7,13,0.70)] px-5 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.20)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-orbi-cyan/65">
            Correo
          </p>
          <p className="mt-2 text-base font-black tracking-tight text-orbi-text">orbimx@icloud.com</p>
          <a
            href="mailto:orbimx@icloud.com"
            className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg border border-orbi-cyan/[0.20] bg-orbi-blue/[0.10] px-5 py-2 text-xs font-bold text-orbi-cyan/90 transition hover:border-orbi-cyan/[0.32] hover:bg-orbi-blue/[0.20]"
          >
            Enviar correo
          </a>
        </div>
        <div className="flex gap-6 text-xs text-orbi-muted">
          <Link href="/privacidad" className="hover:text-orbi-text transition-colors">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:text-orbi-text transition-colors">
            Términos
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
