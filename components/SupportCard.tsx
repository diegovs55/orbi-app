export function SupportCard() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-[rgba(8,20,36,0.55)] to-[rgba(5,7,13,0.70)] px-5 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.20)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-orbi-cyan/65">
        Atención ORBI
      </p>
      <p className="mt-2 text-sm leading-6 text-orbi-muted/80">
        ¿Tienes alguna duda o necesitas ayuda?
      </p>
      <p className="mt-0.5 text-base font-black tracking-tight text-orbi-text">{"+52 220 644 1442"}</p>
      <a
        href="tel:+522206441442"
        className="mt-4 inline-flex min-h-9 items-center justify-center rounded-lg border border-orbi-cyan/[0.20] bg-orbi-blue/[0.10] px-5 py-2 text-xs font-bold text-orbi-cyan/90 transition hover:border-orbi-cyan/[0.32] hover:bg-orbi-blue/[0.20]"
      >
        Llamar
      </a>
    </div>
  );
}
